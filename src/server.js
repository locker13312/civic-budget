// прототип: усі сценарії працюють на статичних даних у пам'яті
import { buildContainer } from './container.js';
import { createLogger, loadSettings } from './platform/index.js';
import { seedStaticData } from './seed.js';
import { buildApp } from './web/index.js';

const settings = loadSettings();
const logger = createLogger();
const container = buildContainer({ storage: 'memory', logger });
await seedStaticData(container.cradle);
logger.info("сховище: статичні дані в пам'яті");

const app = buildApp(container.cradle);
await app.listen({ port: settings.port, host: settings.host });
