import Fastify, { LogController } from 'fastify';

import { currentContext } from '../platform/index.js';
import { registerRequestContext, requestId } from './context.js';
import { registerErrorHandling } from './errors.js';
import { cyclesRoutes } from './routes/cycles.js';
import { projectsRoutes } from './routes/projects.js';
import { systemRoutes } from './routes/system.js';

/**
 * Сервіси, які роути отримують з DI-контейнера (src/container.js).
 *
 * @typedef {{
 *   identityService: import('../identity/index.js').IdentityService,
 *   cyclesService: import('../cycles/index.js').CyclesService,
 *   projectsService: import('../projects/index.js').ProjectsService,
 *   votingService: import('../voting/index.js').VotingService,
 *   resultsService: import('../results/index.js').ResultsService,
 *   readiness: { check(): Promise<void> },
 *   logger: import('pino').Logger,
 * }} Services
 */

/**
 * Збирає HTTP-застосунок; listen викликає server.js.
 *
 * @param {Services} services
 * @returns {import('fastify').FastifyInstance}
 */
export function buildApp(services) {
  const app = Fastify({
    loggerInstance: /** @type {import('fastify').FastifyBaseLogger} */ (services.logger),
    genReqId: requestId,
    // рядок про запит пишемо самі в onResponse, з bpId і користувачем
    logController: new LogController({ disableRequestLogging: true }),
  });

  registerRequestContext(app, services.identityService);
  registerErrorHandling(app);

  // рядок про кожен запит пише логер з контексту, тож у ньому є bpId і користувач
  app.addHook('onResponse', async (request, reply) => {
    services.logger.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
        // скільки запитів до БД коштував запит: N+1 видно в лозі (аудит, п. 1)
        queries: currentContext()?.queries ?? 0,
      },
      'запит виконано',
    );
  });

  systemRoutes(app, services);
  cyclesRoutes(app, services);
  projectsRoutes(app, services);

  return app;
}
