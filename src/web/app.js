import Fastify from 'fastify';

import { gitSha, version } from '../platform/build.js';

/**
 * Збирає застосунок; listen викликає server.js.
 *
 * @param {import('fastify').FastifyServerOptions} [options]
 * @returns {import('fastify').FastifyInstance}
 */
export function buildApp(options = {}) {
  const app = Fastify(options);

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/version', async () => ({ version, sha: gitSha() }));

  return app;
}
