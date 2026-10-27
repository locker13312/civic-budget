import { gitSha, version } from '../../platform/index.js';

/**
 * Живість процесу, доступність джерела даних і версія збірки.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('../app.js').Services} services
 */
export function systemRoutes(app, { readiness }) {
  app.get('/health', async () => ({ status: 'ok' }));

  // помилка недоступної БД іде в глобальний обробник і стає 503
  app.get('/ready', async () => {
    await readiness.check();
    return { status: 'ready' };
  });

  app.get('/version', async () => ({ version, sha: gitSha() }));
}
