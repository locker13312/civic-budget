// міграції на старті контейнера окремими кроками (spec Завдання 4):
//   1. migrations/schema/  — структура, блокуюча, у транзакції з lock_timeout
//   2. migrations/data/    — оновлення даних, кожен файл окремою транзакцією
//   3. migrations/indexes/ — після старту сервера, фоном: CREATE INDEX
//      CONCURRENTLY без таймауту, під advisory lock (buildIndexes)
import { readFile, readdir } from 'node:fs/promises';

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);
// довільні сталі для pg_advisory_lock: два процеси не мігрують одночасно
const LOCK_ID = 714_2026;
const INDEX_LOCK_ID = 714_2027;
// блокуюча міграція не чекає на чужі блокування довше: краще впасти й
// перезапуститись, ніж тримати чергу запитів старої версії за собою
const SCHEMA_LOCK_TIMEOUT = '5s';

/** @typedef {'schema' | 'data' | 'indexes'} MigrationKind */

/**
 * @param {MigrationKind} kind
 * @returns {Promise<{ version: string, file: string, text: string }[]>}
 */
async function migrationFiles(kind) {
  const dir = new URL(`${kind}/`, MIGRATIONS);
  const files = (await readdir(dir).catch(() => []))
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  return Promise.all(
    files.map(async (file) => ({
      version: `${kind}/${file.slice(0, 4)}`,
      file: `${kind}/${file}`,
      text: await readFile(new URL(file, dir), 'utf8'),
    })),
  );
}

/**
 * @param {import('postgres').Sql | import('postgres').TransactionSql} sql
 * @returns {Promise<Set<string>>}
 */
async function appliedVersions(sql) {
  await sql`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`;
  // до Завдання 4 версії були без теки: '0001' — це schema/0001
  await sql`update schema_migrations set version = 'schema/' || version
    where version ~ '^[0-9]{4}$'`;
  return new Set(
    (await sql`select version from schema_migrations`).map((r) => r.version),
  );
}

/**
 * Застосовує нові міграції структури або даних, кожен файл у транзакції.
 *
 * @param {import('./connect.js').Db} db
 * @param {import('pino').Logger} logger
 * @param {'schema' | 'data'} kind
 * @returns {Promise<string[]>} застосовані версії
 */
export async function migrate(db, logger, kind) {
  /** @type {string[]} */
  const applied = [];
  for (const migration of await migrationFiles(kind)) {
    const done = await db.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${LOCK_ID})`;
      if ((await appliedVersions(tx)).has(migration.version)) {
        return false;
      }
      if (kind === 'schema') {
        await tx.unsafe(`set local lock_timeout = '${SCHEMA_LOCK_TIMEOUT}'`);
      }
      // оновлення даних може йти довше за таймаут звичайного запиту
      await tx`set local statement_timeout = 0`;
      await tx.unsafe(migration.text);
      await tx`insert into schema_migrations (version) values (${migration.version})`;
      return true;
    });
    if (done) {
      applied.push(migration.version);
      logger.info({ migration: migration.file }, 'міграцію застосовано');
    }
  }
  return applied;
}

/**
 * Будує індекси з migrations/indexes/ після старту сервера. Кожен файл —
 * одна команда `create index concurrently if not exists <назва> …`: вона не
 * блокує запис і не може йти в транзакції. Таймауту немає: на великій базі
 * це може тривати довго, а сервер уже обслуговує запити. Індекс, що
 * лишився недобудованим після падіння (indisvalid = false), видаляється і
 * будується заново. Інший процес, що вже будує індекси (стара й нова версії
 * під час blue-green), тримає advisory lock — тоді цей нічого не робить.
 *
 * @param {import('./connect.js').Db} db
 * @param {import('pino').Logger} logger
 * @returns {Promise<string[]>} побудовані версії
 */
export async function buildIndexes(db, logger) {
  const migrations = await migrationFiles('indexes');
  if (migrations.length === 0) {
    return [];
  }
  const sql = await db.sql.reserve();
  /** @type {string[]} */
  const built = [];
  try {
    const [lock] = await sql`select pg_try_advisory_lock(${INDEX_LOCK_ID}) as ok`;
    if (!lock?.ok) {
      logger.info('індекси вже будує інший процес');
      return built;
    }
    try {
      await sql`set statement_timeout = 0`;
      await sql`set lock_timeout = 0`;
      const done = await appliedVersions(sql);
      for (const migration of migrations) {
        if (done.has(migration.version)) {
          continue;
        }
        const name = indexName(migration);
        const [invalid] = await sql`
          select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
          where c.relname = ${name} and not i.indisvalid`;
        if (invalid) {
          logger.warn({ index: name }, 'недобудований індекс видалено, будую заново');
          await sql.unsafe(`drop index concurrently if exists ${name}`);
        }
        logger.info({ migration: migration.file }, 'будую індекс');
        await sql.unsafe(migration.text);
        await sql`insert into schema_migrations (version) values (${migration.version})`;
        built.push(migration.version);
        logger.info({ migration: migration.file }, 'індекс побудовано');
      }
    } finally {
      await sql`select pg_advisory_unlock(${INDEX_LOCK_ID})`;
      await sql`reset statement_timeout`;
      await sql`reset lock_timeout`;
    }
  } finally {
    sql.release();
  }
  return built;
}

/**
 * @param {{ file: string, text: string }} migration
 * @returns {string}
 */
function indexName({ file, text }) {
  const match =
    /create\s+(?:unique\s+)?index\s+concurrently\s+if\s+not\s+exists\s+(\w+)/i.exec(text);
  if (!match?.[1]) {
    throw new Error(
      `${file}: очікую одну команду «create index concurrently if not exists <назва>»`,
    );
  }
  return match[1];
}
