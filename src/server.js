import { loadSettings } from './platform/index.js';
import { buildApp } from './web/index.js';

const settings = loadSettings();
const app = buildApp({ logger: true });

await app.listen({ port: settings.port, host: '0.0.0.0' });
