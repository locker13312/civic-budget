import postgres from 'postgres';

import { countQuery } from '../context.js';
import { ConflictError, SourceUnavailableError } from '../errors.js';
import { inTransaction } from './tx.js';

/**
 * @typedef {{
 *   sql: import('postgres').Sql,
 *   tx<T>(fn: (tx: import('postgres').TransactionSql) => Promise<T>,
 *     options?: { isolation?: 'read committed' | 'repeatable read' | 'serializable' }): Promise<T>,
 *   ping(): Promise<void>,
 *   close(): Promise<void>,
 *   conflictOnUnique(message: string): (error: unknown) => never,
 * }} Db
 */

// bigint (гроші в копійках) читаємо як number: межу перевіряємо явно
const int8 = {
  to: 20,
  from: [20],
  /**
   * @param {unknown} value
   * @returns {string}
   */
  serialize: (value) => String(value),
  /**
   * @param {string} value
   * @returns {number}
   */
  parse: (value) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) {
      throw new RangeError(`bigint ${value} не вміщається в number`);
    }
    return number;
  },
};

/**
 * Пул з'єднань, створений явно на старті. `select now()` одразу перевіряє,
 * що БД доступна: без неї процес не стартує, а не падає на першому запиті.
 *
 * Таймаути на рівні сесії: запит довше statementTimeoutMs або очікування
 * блокування довше lockTimeoutMs завершуються помилкою, яка стає 503, а не
 * вічним очікуванням (аудит Завдання 2, п. 2).
 *
 * @param {{
 *   url: string,
 *   logger: import('pino').Logger,
 *   max?: number,
 *   connectTimeout?: number,
 *   statementTimeoutMs?: number,
 *   lockTimeoutMs?: number,
 * }} options
 * @returns {Promise<Db>}
 */
export async function connectDb({
  url,
  logger,
  max = 10,
  connectTimeout = 5,
  statementTimeoutMs = 5000,
  lockTimeoutMs = 2000,
}) {
  const sql = postgres(url, {
    max,
    connect_timeout: connectTimeout,
    idle_timeout: 30,
    max_lifetime: 30 * 60,
    onnotice: () => {},
    connection: {
      statement_timeout: statementTimeoutMs,
      lock_timeout: lockTimeoutMs,
      idle_in_transaction_session_timeout: 10 * statementTimeoutMs,
    },
    types: { int8 },
    transform: { undefined: null },
    debug: (_connection, query) => {
      // postgres.js сам читає типи з pg_catalog на новому з'єднанні: це не наш запит
      if (query.includes('pg_catalog.pg_type')) {
        return;
      }
      countQuery();
      logger.debug({ sql: query.replace(/\s+/g, ' ').trim().slice(0, 200) }, 'sql');
    },
  });

  try {
    const [row] = await sql`select now() as now`;
    logger.info({ dbTime: row?.now }, 'БД доступна');
  } catch (error) {
    await sql.end({ timeout: 1 });
    throw new SourceUnavailableError(
      `не вдалося підключитися до БД ${redact(url)}: ${/** @type {Error} */ (error).message}`,
      { cause: error },
    );
  }

  return {
    sql,
    tx: (fn, options = {}) => inTransaction(sql, fn, { ...options, logger }),
    ping: async () => {
      await sql`select 1`;
    },
    close: () => sql.end({ timeout: 5 }),
    // порушення унікальності (23505) — це конфлікт з уже наявним записом
    conflictOnUnique: (message) => (error) => {
      if (/** @type {{ code?: string }} */ (error)?.code === '23505') {
        throw new ConflictError(message);
      }
      throw error;
    },
  };
}

/**
 * @param {string} url
 * @returns {string}
 */
function redact(url) {
  return url.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:***@');
}
