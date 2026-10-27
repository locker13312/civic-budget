import { idParams, idempotencyHeaders, money } from '../schemas.js';

/**
 * @typedef {{ projectId: number }} ProjectParams
 */

/**
 * Заявка, рішення модератора, голос і звіти про реалізацію.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('../app.js').Services} services
 */
export function projectsRoutes(app, { projectsService, votingService, resultsService }) {
  const params = idParams('projectId');
  /**
   * @param {import('fastify').FastifyRequest} request
   * @returns {number}
   */
  const projectId = (request) => /** @type {ProjectParams} */ (request.params).projectId;

  app.get('/projects/:projectId', { schema: { params } }, async (request) =>
    projectsService.details(projectId(request)),
  );

  app.post(
    '/projects/:projectId/review',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['decision'],
          properties: {
            decision: { type: 'string', enum: ['approve', 'reject'] },
            reason: { type: 'string', maxLength: 2000, default: '' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = /** @type {{ decision: 'approve' | 'reject', reason: string }} */ (
        request.body
      );
      return reply.code(201).send(await projectsService.review(projectId(request), body));
    },
  );

  app.post('/projects/:projectId/votes', { schema: { params } }, async (request, reply) =>
    reply.code(201).send(await votingService.cast(projectId(request))),
  );

  app.post(
    '/projects/:projectId/progress',
    {
      schema: {
        params,
        headers: idempotencyHeaders,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['spent'],
          properties: {
            spent: money,
            note: { type: 'string', maxLength: 2000, default: '' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = /** @type {{ spent: number, note: string }} */ (request.body);
      const key = request.headers['idempotency-key'];
      const { report, replayed } = await resultsService.addProgress(
        projectId(request),
        body,
        typeof key === 'string' ? key : null,
      );
      return reply.code(replayed ? 200 : 201).send(report);
    },
  );

  app.get('/projects/:projectId/progress', { schema: { params } }, async (request) =>
    resultsService.progress(projectId(request)),
  );

  app.get(
    '/me/votes',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['cycleId'],
          properties: { cycleId: { type: 'integer', minimum: 1 } },
        },
      },
    },
    async (request) =>
      votingService.myVotes(/** @type {{ cycleId: number }} */ (request.query).cycleId),
  );
}
