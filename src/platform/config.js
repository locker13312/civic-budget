/**
 * @typedef {object} Settings
 * @property {string} databaseUrl
 * @property {string | undefined} gitSha
 * @property {string} host
 * @property {number} port
 */

/**
 * Налаштування з оточення.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Settings}
 */
export function loadSettings(env = process.env) {
  return Object.freeze({
    databaseUrl: env.CIVIC_DATABASE_URL ?? 'postgres://localhost:5432/civic_budget',
    gitSha: env.GIT_SHA || undefined,
    // лише локально: на Windows 0.0.0.0 викликає запит брандмауера
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 3000),
  });
}
