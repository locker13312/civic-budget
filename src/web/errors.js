import { DomainError, isSourceUnavailable } from '../platform/index.js';

/** @type {Record<import('../platform/index.js').ErrorKind, number>} */
const STATUS_BY_KIND = {
  rule: 422,
  conflict: 409,
  forbidden: 403,
  not_found: 404,
  unauthenticated: 401,
};

/**
 * Єдиний обробник помилок: роути й сервіси не ловлять помилки, а кидають
 * їх; тут вони стають HTTP-відповіддю `{ error, message, bpId }`.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export function registerErrorHandling(app) {
  app.setErrorHandler((error, request, reply) => {
    const bpId = request.id;

    if (error instanceof DomainError) {
      return reply
        .code(STATUS_BY_KIND[error.kind])
        .send({ error: error.code, message: error.message, bpId });
    }

    if (isSourceUnavailable(error)) {
      request.log.warn({ err: error }, 'джерело даних недоступне');
      return reply.code(503).header('retry-after', '2').send({
        error: 'source_unavailable',
        message: 'база даних тимчасово недоступна, повторіть запит пізніше',
        bpId,
      });
    }

    const fastifyError = /** @type {import('fastify').FastifyError} */ (error);
    if (fastifyError.validation) {
      return reply.code(400).send({
        error: 'validation_failed',
        message: fastifyError.message,
        bpId,
        details: fastifyError.validation,
      });
    }

    const status = fastifyError.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply
        .code(status)
        .send({ error: 'bad_request', message: fastifyError.message, bpId });
    }

    request.log.error({ err: error }, 'неочікувана помилка');
    return reply
      .code(500)
      .send({ error: 'internal', message: 'внутрішня помилка сервера', bpId });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: 'not_found',
      message: `маршрут ${request.method} ${request.url} не знайдено`,
      bpId: request.id,
    }),
  );
}
