/**
 * Вид помилки визначає HTTP-статус у глобальному обробнику (web/errors.js):
 * rule 422, conflict 409, forbidden 403, not_found 404, unauthenticated 401.
 *
 * @typedef {'rule' | 'conflict' | 'forbidden' | 'not_found' | 'unauthenticated'} ErrorKind
 */

/** Порушення бізнес-правила; code стабільний і йде в API. */
export class DomainError extends Error {
  code = 'domain_error';
  /** @type {ErrorKind} */
  kind = 'rule';

  /**
   * @param {string} message
   * @param {{ kind?: ErrorKind }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = new.target.name;
    if (options.kind) {
      this.kind = options.kind;
    }
  }
}

export class NotFoundError extends DomainError {
  code = 'not_found';
  /** @type {ErrorKind} */
  kind = 'not_found';
}

export class ForbiddenError extends DomainError {
  code = 'forbidden';
  /** @type {ErrorKind} */
  kind = 'forbidden';
}

export class UnauthenticatedError extends DomainError {
  code = 'unauthenticated';
  /** @type {ErrorKind} */
  kind = 'unauthenticated';
}

export class ConflictError extends DomainError {
  code = 'conflict';
  /** @type {ErrorKind} */
  kind = 'conflict';
}

/** Джерело даних (БД) недоступне; клієнт може повторити пізніше. */
export class SourceUnavailableError extends Error {
  code = 'source_unavailable';

  /**
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'SourceUnavailableError';
  }
}

// коди postgres.js і PostgreSQL, коли сервер недоступний або обірвав з'єднання
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  '57P01',
  '57P02',
  '57P03',
  // БД відповідає, але не вчасно: statement_timeout і lock_timeout (аудит, п. 2)
  '57014',
  '55P03',
]);

/**
 * Чи помилка означає, що БД недоступна (а не помилку в запиті чи даних).
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isSourceUnavailable(error) {
  if (error instanceof SourceUnavailableError) {
    return true;
  }
  const code = /** @type {{ code?: unknown }} */ (error)?.code;
  return (
    typeof code === 'string' && (UNAVAILABLE_CODES.has(code) || code.startsWith('08'))
  );
}
