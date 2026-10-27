import { randomUUID } from 'node:crypto';

import { UnauthenticatedError, runInContext, setInitiator } from '../platform/index.js';

const SAFE_REQUEST_ID = /^[\w.:-]{1,100}$/;

/**
 * bpId з X-Request-Id, якщо клієнт його передав і він безпечний для логів.
 *
 * @param {import('node:http').IncomingMessage} request
 * @returns {string}
 */
export function requestId(request) {
  const incoming = request.headers['x-request-id'];
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
    ? incoming
    : randomUUID();
}

/**
 * Кожен запит виконується в контексті бізнес-процесу: bpId і ініціатор
 * доступні сервісам і репозиторіям без передачі параметрами (adr/0008).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('../identity/index.js').IdentityService} identityService
 */
export function registerRequestContext(app, identityService) {
  app.addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id);
    runInContext({ bpId: request.id }, done);
  });

  app.addHook('onRequest', async (request) => {
    const raw = request.headers['x-user-id'];
    if (raw === undefined) {
      return;
    }
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new UnauthenticatedError('X-User-Id має бути додатним цілим числом');
    }
    const user = await identityService.findById(id);
    if (!user) {
      throw new UnauthenticatedError(`користувача ${id} не знайдено`);
    }
    setInitiator(user);
  });
}
