// міграції окремими кроками і seed окремо від них (AC-4.5, AC-4.6):
// на справжньому PostgreSQL, з порожньої бази
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { seedIfEmpty } from '../../src/container.js';
import { buildIndexes, connectDb, migrate } from '../../src/platform/db/index.js';
import { createLogger } from '../../src/platform/index.js';
import { createTestDatabase } from '../support/pg.js';
import { startServer } from '../support/server.js';

const logger = createLogger({ level: 'silent' });
const probe = await createTestDatabase();
await probe?.drop();
const skip = probe ? false : 'PostgreSQL недоступний';

/** @type {Array<() => Promise<void>>} */
const cleanup = [];
after(async () => {
  for (const fn of cleanup.reverse()) {
    await fn();
  }
});

/**
 * @param {{ empty?: boolean }} [options]
 */
async function database(options) {
  const created =
    /** @type {NonNullable<Awaited<ReturnType<typeof createTestDatabase>>>} */ (
      await createTestDatabase(options)
    );
  const db = await connectDb({ url: created.url, logger, max: 3 });
  cleanup.push(created.drop, db.close);
  /** @returns {Promise<string[]>} */
  const versions = async () =>
    (await db.sql`select version from schema_migrations order by version`).map(
      (r) => r.version,
    );
  /**
   * @param {string} name
   * @returns {Promise<boolean | null>} null — індексу немає
   */
  const indexValid = async (name) => {
    const [row] = await db.sql`
      select i.indisvalid as valid from pg_index i
      join pg_class c on c.oid = i.indexrelid where c.relname = ${name}`;
    return row ? Boolean(row.valid) : null;
  };
  return { ...created, db, versions, indexValid };
}

describe('міграції окремими кроками', { skip }, () => {
  test('[AC-4.5] структура, дані й індекси застосовуються окремими кроками', async () => {
    const { db, versions, indexValid } = await database({ empty: true });

    assert.deepEqual(await migrate(db, logger, 'schema'), ['schema/0001']);
    assert.deepEqual(await versions(), ['schema/0001']);
    assert.equal(await indexValid('projects_cycle_id_idx'), null);

    assert.deepEqual(await migrate(db, logger, 'data'), ['data/0001']);
    assert.deepEqual(await buildIndexes(db, logger), ['indexes/0001']);

    assert.deepEqual(await versions(), ['data/0001', 'indexes/0001', 'schema/0001']);
    assert.equal(await indexValid('projects_cycle_id_idx'), true);
    assert.deepEqual(await migrate(db, logger, 'schema'), [], 'повтор нічого не робить');
    assert.deepEqual(await buildIndexes(db, logger), []);
  });

  test('[AC-4.5] база до Завдання 4 (версія 0001 без теки) не мігрує схему вдруге', async () => {
    const { db, versions } = await database({ empty: true });
    await migrate(db, logger, 'schema');
    await db.sql`update schema_migrations set version = '0001'`;

    assert.deepEqual(await migrate(db, logger, 'schema'), []);
    assert.deepEqual(await versions(), ['schema/0001']);
  });

  test('[AC-4.5] недобудований індекс після падіння перебудовується', async () => {
    const { db, indexValid } = await database();
    await seedIfEmpty(db, logger);
    await db.sql`drop index projects_cycle_id_idx`;
    await db.sql`delete from schema_migrations where version = 'indexes/0001'`;
    // унікальний індекс на неунікальних даних падає і лишає invalid індекс з
    // тією ж назвою — так само, як перерваний CREATE INDEX CONCURRENTLY
    await assert.rejects(
      db.sql`create unique index concurrently projects_cycle_id_idx on projects (cycle_id)`,
      { code: '23505' },
    );
    assert.equal(await indexValid('projects_cycle_id_idx'), false);

    assert.deepEqual(await buildIndexes(db, logger), ['indexes/0001']);

    assert.equal(await indexValid('projects_cycle_id_idx'), true);
    const [definition] =
      await db.sql`select indexdef from pg_indexes where indexname = 'projects_cycle_id_idx'`;
    assert.match(String(definition?.indexdef), /\(cycle_id, id\)/);
  });

  test('[AC-4.5] індекс будується після старту і не блокує /ready', async () => {
    const { db, url, versions, indexValid } = await database();
    await seedIfEmpty(db, logger);
    await db.sql`drop index projects_cycle_id_idx`;
    await db.sql`delete from schema_migrations where version = 'indexes/0001'`;
    // відкрита транзакція, що пише в projects: CREATE INDEX CONCURRENTLY
    // чекає її завершення, як чекав би довгої побудови на великій базі
    const writer = await db.sql.reserve();
    await writer`begin`;
    await writer`update projects set title = title where id = 1`;

    const server = await startServer({ seedUrl: url, seed: false });
    cleanup.push(async () => void server.stop());

    const ready = await server.http('GET', '/ready');
    const projects = await server.http('GET', '/cycles/1/projects');
    const versionsWhileBuilding = await versions();
    await writer`commit`;
    writer.release();

    assert.equal(ready.status, 200);
    assert.equal(projects.status, 200);
    assert.ok(!versionsWhileBuilding.includes('indexes/0001'));
    for (let i = 0; i < 100 && !(await versions()).includes('indexes/0001'); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(await indexValid('projects_cycle_id_idx'), true);
  });
});

describe('seed окремо від міграцій', { skip }, () => {
  test('[AC-4.6] seed записує статичні дані один раз, повтор нічого не дублює', async () => {
    const { db } = await database();

    assert.equal(await seedIfEmpty(db, logger), true);
    const [first] = await db.sql`select count(*)::int as n from projects`;
    assert.equal(await seedIfEmpty(db, logger), false);
    const [second] = await db.sql`select count(*)::int as n from projects`;

    assert.ok((first?.n ?? 0) > 0);
    assert.equal(second?.n, first?.n);
  });

  test('[AC-4.6] сервер записує статичні дані лише за SEED=1', async () => {
    const plain = await database({ empty: true });
    const seeded = await database({ empty: true });

    const withoutSeed = await startServer({ seedUrl: plain.url, seed: false });
    cleanup.push(async () => void withoutSeed.stop());
    const withSeed = await startServer({
      seedUrl: seeded.url,
      seed: false,
      env: { SEED: '1' },
    });
    cleanup.push(async () => void withSeed.stop());

    assert.deepEqual((await withoutSeed.http('GET', '/cycles')).body, []);
    assert.ok((await withSeed.http('GET', '/cycles')).body.length > 0);
  });
});
