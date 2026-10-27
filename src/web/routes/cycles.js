import { category, idParams, idempotencyHeaders, money } from '../schemas.js';

/**
 * @typedef {{ Params: { cycleId: number } }} CycleRoute
 * @typedef {Omit<import('../../cycles/index.js').NewCycle,
 *   'submissionFrom' | 'submissionTo' | 'votingFrom' | 'votingTo'> & {
 *   submissionFrom: string, submissionTo: string, votingFrom: string, votingTo: string,
 * }} NewCycleBody тіло POST /cycles, дати рядками ISO 8601
 */

/**
 * Раунди, заявки раунду і підсумки. Роут знає лише HTTP: форма запиту,
 * статус відповіді; рішення — у сервісах.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('../app.js').Services} services
 */
export function cyclesRoutes(
  app,
  { cyclesService, projectsService, votingService, resultsService },
) {
  const params = idParams('cycleId');

  app.get('/cycles', async () => cyclesService.list());

  app.post(
    '/cycles',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'title',
            'submissionFrom',
            'submissionTo',
            'votingFrom',
            'votingTo',
            'maxVotes',
            'minVotes',
            'limits',
          ],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            submissionFrom: { type: 'string', format: 'date-time' },
            submissionTo: { type: 'string', format: 'date-time' },
            votingFrom: { type: 'string', format: 'date-time' },
            votingTo: { type: 'string', format: 'date-time' },
            maxVotes: { type: 'integer', minimum: 1, maximum: 100 },
            minVotes: { type: 'integer', minimum: 0 },
            limits: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['category', 'budget', 'maxCost'],
                properties: { category, budget: money, maxCost: money },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = /** @type {NewCycleBody} */ (request.body);
      const cycle = await cyclesService.create({
        ...body,
        submissionFrom: new Date(body.submissionFrom),
        submissionTo: new Date(body.submissionTo),
        votingFrom: new Date(body.votingFrom),
        votingTo: new Date(body.votingTo),
      });
      return reply.code(201).send(cycle);
    },
  );

  app.get('/cycles/:cycleId', { schema: { params } }, async (request) =>
    cyclesService.getWithPhase(
      /** @type {CycleRoute['Params']} */ (request.params).cycleId,
    ),
  );

  app.get('/cycles/:cycleId/projects', { schema: { params } }, async (request) =>
    votingService.listWithCounts(
      /** @type {CycleRoute['Params']} */ (request.params).cycleId,
    ),
  );

  app.post(
    '/cycles/:cycleId/projects',
    {
      schema: {
        params,
        headers: idempotencyHeaders,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['category', 'title', 'cost'],
          properties: {
            category,
            title: { type: 'string', minLength: 1, maxLength: 200 },
            cost: money,
          },
        },
      },
    },
    async (request, reply) => {
      const { cycleId } = /** @type {CycleRoute['Params']} */ (request.params);
      const body =
        /** @type {{ category: 'small' | 'large', title: string, cost: number }} */ (
          request.body
        );
      const key = request.headers['idempotency-key'];
      const { project, replayed } = await projectsService.submit(
        cycleId,
        body,
        typeof key === 'string' ? key : null,
      );
      return reply.code(replayed ? 200 : 201).send(project);
    },
  );

  app.post('/cycles/:cycleId/tally', { schema: { params } }, async (request) =>
    resultsService.tally(/** @type {CycleRoute['Params']} */ (request.params).cycleId),
  );

  app.get('/cycles/:cycleId/results', { schema: { params } }, async (request) =>
    resultsService.results(/** @type {CycleRoute['Params']} */ (request.params).cycleId),
  );
}
