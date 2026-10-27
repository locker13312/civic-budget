import { Writable } from 'node:stream';

import { buildContainer } from '../../src/container.js';
import { createLogger } from '../../src/platform/index.js';
import { seedStaticData } from '../../src/seed.js';
import { buildApp } from '../../src/web/index.js';

/**
 * Логер, що збирає рядки в масив, щоб тести могли перевірити їхній вміст.
 *
 * @returns {{ logger: import('pino').Logger, lines: Array<Record<string, unknown>> }}
 */
export function captureLogs() {
  /** @type {Array<Record<string, unknown>>} */
  const lines = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      for (const line of String(chunk).split('\n').filter(Boolean)) {
        lines.push(JSON.parse(line));
      }
      callback();
    },
  });
  return { logger: createLogger({ level: 'debug', stream }), lines };
}

/**
 * Застосунок на статичних даних у пам'яті.
 *
 * @param {{ logger?: import('pino').Logger }} [options]
 */
export async function memoryApp({ logger = createLogger({ level: 'silent' }) } = {}) {
  const container = buildContainer({ storage: 'memory', logger });
  const data = await seedStaticData(container.cradle);
  const app = buildApp(container.cradle);
  return { app, data, container, close: async () => app.close() };
}
