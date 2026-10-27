// запуск: `npm start` — PostgreSQL, `npm run start:static` — статичні дані
import { buildContainer } from './container.js';
import { connectDb, migrate } from './platform/db/index.js';
import { createLogger, loadSettings } from './platform/index.js';
import { seedStaticData } from './seed.js';
import { buildApp } from './web/index.js';

const settings = loadSettings();
const logger = createLogger();
const isStatic = process.argv.includes('--static');

/** @returns {Promise<{ container: ReturnType<typeof buildContainer>, close(): Promise<void> }>} */
async function start() {
  if (isStatic) {
    const container = buildContainer({ storage: 'memory', logger });
    await seedStaticData(container.cradle);
    logger.info("сховище: статичні дані в пам'яті");
    return { container, close: async () => {} };
  }
  // пул створюється явно, select now() одразу: без БД процес не стартує
  const db = await connectDb({ url: settings.databaseUrl, logger });
  await migrate(db, logger);
  logger.info('сховище: PostgreSQL');
  return {
    container: buildContainer({ storage: 'postgres', db, logger }),
    close: db.close,
  };
}

const { container, close } = await start().catch((/** @type {Error} */ error) => {
  logger.fatal({ err: error }, `сервер не запущено: ${error.message}`);
  process.exit(1);
});

const app = buildApp(container.cradle);
app.addHook('onClose', close);
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.once(signal, () => void app.close());
}
await app.listen({ port: settings.port, host: settings.host });
