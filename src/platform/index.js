// інфраструктура без бізнес-правил: налаштування, помилки, контекст запиту,
// логер, годинник, версія збірки. Доступ до БД — окремо, platform/db
export { gitSha, resetGitShaCache, version } from './build.js';
export { systemClock } from './clock.js';
export { loadSettings } from './config.js';
export {
  countQuery,
  currentContext,
  requireInitiator,
  runInContext,
  setInitiator,
} from './context.js';
export {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  SourceUnavailableError,
  UnauthenticatedError,
  isSourceUnavailable,
} from './errors.js';
export { fingerprint } from './fingerprint.js';
export { createLogger } from './logger.js';

/** @typedef {import('./clock.js').Clock} Clock */
/** @typedef {import('./context.js').Initiator} Initiator */
/** @typedef {import('./errors.js').ErrorKind} ErrorKind */
