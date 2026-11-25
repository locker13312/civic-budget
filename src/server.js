// запуск: `npm start` — PostgreSQL, `npm run start:static` — статичні дані.
// Це й entrypoint контейнера (Dockerfile): кроки старту на стейджі й проді
// однакові (spec Завдання 4):
//   1. міграції структури → 2. оновлення даних → 3. seed (лише SEED=1) →
//   4. сервер слухає порт → 5. індекси фоном, без таймауту старту
import { setTimeout as sleep } from 'node:timers/promises';

import { buildContainer, seedIfEmpty } from './container.js';
import { buildIndexes, connectDb, migrate } from './platform/db/index.js';
import { createLogger, loadSettings } from './platform/index.js';
import { seedStaticData } from './seed.js';
import { buildApp } from './web/index.js';

const settings = loadSettings();
const logger = createLogger();
const isStatic = process.argv.includes('--static');

/**
 * @returns {Promise<{
 *   container: ReturnType<typeof buildContainer>,
 *   afterListen(): void,
 *   close(): Promise<void>,
 * }>}
 */
async function start() {
  if (isStatic) {
    const container = buildContainer({ storage: 'memory', logger });
    await seedStaticData(container.cradle);
    logger.info("сховище: статичні дані в пам'яті");
    return { container, afterListen: () => {}, close: async () => {} };
  }
  // пул створюється явно, select now() одразу: без БД процес не стартує
  const db = await connectDb({ url: settings.databaseUrl, logger });
  await migrate(db, logger, 'schema');
  await migrate(db, logger, 'data');
  if (settings.seed) {
    await seedIfEmpty(db, logger);
  }
  logger.info('сховище: PostgreSQL');
  return {
    container: buildContainer({ storage: 'postgres', db, logger }),
    // індекс на великій базі будується довго: сервер уже відповідає, а
    // помилка лише записується в лог і повториться на наступному старті
    afterListen: () => {
      buildIndexes(db, logger).catch((/** @type {Error} */ error) => {
        logger.error({ err: error }, `індекси не побудовано: ${error.message}`);
      });
    },
    close: db.close,
  };
}

const { container, afterListen, close } = await start().catch(
  (/** @type {Error} */ error) => {
    logger.fatal({ err: error }, `сервер не запущено: ${error.message}`);
    process.exit(1);
  },
);

const app = buildApp(container.cradle);
app.addHook('onClose', close);

// зупинка без втрачених запитів: спершу /ready = 503, щоб балансувальник
// перестав слати нові; після паузи Fastify доробляє поточні й закриває порт
let stopping = false;
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.once(signal, () => {
    if (stopping) {
      return;
    }
    stopping = true;
    container.cradle.readiness.drain();
    logger.info({ signal, delayMs: settings.shutdownDelayMs }, 'зупинка: /ready = 503');
    void sleep(settings.shutdownDelayMs)
      .then(() => app.close())
      .then(() => logger.info('зупинено'));
  });
}
await app.listen({ port: settings.port, host: settings.host });
afterListen();
