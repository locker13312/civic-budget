import { readFile, readdir } from 'node:fs/promises';

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);
// довільна стала для pg_advisory_lock: два процеси не мігрують одночасно
const LOCK_ID = 714_2026;

/**
 * Застосовує нові файли migrations/NNNN_*.sql по черзі, кожен у транзакції.
 *
 * @param {import('./connect.js').Db} db
 * @param {import('pino').Logger} logger
 * @returns {Promise<string[]>} застосовані версії
 */
export async function migrate(db, logger) {
  const files = (await readdir(MIGRATIONS))
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  return db.sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_ID})`;
    await tx`create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`;
    const done = new Set(
      (await tx`select version from schema_migrations`).map((r) => r.version),
    );
    /** @type {string[]} */
    const applied = [];
    for (const file of files) {
      const version = file.slice(0, 4);
      if (done.has(version)) {
        continue;
      }
      await tx.unsafe(await readFile(new URL(file, MIGRATIONS), 'utf8'));
      await tx`insert into schema_migrations (version) values (${version})`;
      applied.push(version);
      logger.info({ migration: file }, 'міграцію застосовано');
    }
    return applied;
  });
}
