import { SourceUnavailableError } from './errors.js';

/**
 * @typedef {{ check(): Promise<void>, drain(): void, readonly draining: boolean }} Readiness
 */

/**
 * Готовність приймати трафік (spec Завдання 4, blue-green): джерело даних
 * доступне і процес не зупиняється. Після drain() `/ready` дає 503, щоб
 * балансувальник перестав слати нові запити, поки поточні доробляються.
 *
 * @param {() => Promise<void>} ping
 * @returns {Readiness}
 */
export function createReadiness(ping) {
  let draining = false;
  return {
    check: async () => {
      if (draining) {
        throw new SourceUnavailableError('сервер зупиняється');
      }
      await ping();
    },
    drain: () => {
      draining = true;
    },
    get draining() {
      return draining;
    },
  };
}
