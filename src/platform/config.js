import { existsSync } from 'node:fs';

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
  if (env === process.env) {
    loadDotEnv();
  }
  return Object.freeze({
    // 55432, а не 5432–5434: не конфліктує з PostgreSQL, уже встановленим локально
    databaseUrl:
      env.CIVIC_DATABASE_URL ?? 'postgres://civic:civic@127.0.0.1:55432/civic_budget',
    gitSha: env.GIT_SHA || undefined,
    // лише локально: на Windows 0.0.0.0 викликає запит брандмауера
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 3000),
  });
}

let dotEnvLoaded = false;

// .env поруч з package.json (не комітиться): напр. CIVIC_DATABASE_URL
function loadDotEnv() {
  if (dotEnvLoaded) {
    return;
  }
  dotEnvLoaded = true;
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}
