// транзакція з повтором: SERIALIZABLE може відхилити транзакцію через
// конфлікт з паралельною (40001) або взаємне блокування (40P01); тоді
// безпечно виконати її ще раз — попередня спроба нічого не записала
const RETRYABLE = new Set(['40001', '40P01']);
const ATTEMPTS = 5;

/**
 * @template T
 * @param {import('postgres').Sql} sql
 * @param {(tx: import('postgres').TransactionSql) => Promise<T>} fn
 * @param {{ isolation?: 'read committed' | 'repeatable read' | 'serializable',
 *   logger: import('pino').Logger }} options
 * @returns {Promise<T>}
 */
export async function inTransaction(sql, fn, { isolation = 'read committed', logger }) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return /** @type {T} */ (await sql.begin(`isolation level ${isolation}`, fn));
    } catch (error) {
      const code = /** @type {{ code?: string }} */ (error).code;
      if (!code || !RETRYABLE.has(code) || attempt >= ATTEMPTS) {
        throw error;
      }
      logger.info({ attempt, code }, 'транзакцію повторено через конфлікт');
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10 * attempt));
    }
  }
}
