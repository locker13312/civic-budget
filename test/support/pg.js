// окрема база на кожен прогін (AC-2.9): шаблон мігрується один раз на
// процес, кожен тест отримує копію (CREATE DATABASE … TEMPLATE) і видаляє її
import { randomBytes } from 'node:crypto';

import postgres from 'postgres';

import { connectDb, migrate } from '../../src/platform/db/index.js';
import { createLogger } from '../../src/platform/index.js';

export const ADMIN_URL =
  process.env.CIVIC_TEST_DATABASE_URL ??
  'postgres://civic:civic@127.0.0.1:55432/postgres';

const silent = createLogger({ level: 'silent' });

/** @type {Promise<string | null> | undefined} */
let template;

/**
 * @param {string} name
 * @returns {string}
 */
export function urlFor(name) {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * @template T
 * @param {(sql: import('postgres').Sql) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withAdmin(fn) {
  const sql = postgres(ADMIN_URL, { max: 1, connect_timeout: 2, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

/**
 * @param {string} prefix
 * @returns {string}
 */
const uniqueName = (prefix) =>
  `${prefix}_${process.pid}_${randomBytes(4).toString('hex')}`;

/**
 * Мігрований шаблон бази або null, якщо PostgreSQL недоступний. У CI
 * (CIVIC_REQUIRE_DB=1) недоступна БД — помилка, а не пропуск тестів.
 *
 * @returns {Promise<string | null>}
 */
function templateDatabase() {
  template ??= (async () => {
    const name = uniqueName('civic_tpl');
    try {
      await withAdmin((sql) => sql.unsafe(`create database ${name}`));
    } catch (error) {
      if (process.env.CIVIC_REQUIRE_DB === '1') {
        throw new Error(`PostgreSQL для тестів недоступний: ${ADMIN_URL}`, {
          cause: error,
        });
      }
      return null;
    }
    const db = await connectDb({ url: urlFor(name), logger: silent, max: 1 });
    await migrate(db, silent);
    await db.close();
    process.once('beforeExit', () => {
      void withAdmin((sql) => sql.unsafe(`drop database if exists ${name} with (force)`));
    });
    return name;
  })();
  return template;
}

/**
 * Нова порожня мігрована база для одного тесту.
 *
 * @returns {Promise<{ name: string, url: string, drop(): Promise<void> } | null>}
 */
export async function createTestDatabase() {
  const source = await templateDatabase();
  if (!source) {
    return null;
  }
  const name = uniqueName('civic_test');
  await withAdmin((sql) => sql.unsafe(`create database ${name} template ${source}`));
  return {
    name,
    url: urlFor(name),
    drop: async () => {
      await withAdmin((sql) =>
        sql.unsafe(`drop database if exists ${name} with (force)`),
      );
    },
  };
}
