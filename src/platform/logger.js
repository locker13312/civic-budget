import pino from 'pino';

import { currentContext } from './context.js';

/**
 * Логер, який сам додає bpId і користувача з контексту в кожен рядок.
 *
 * @param {{ level?: string, stream?: import('pino').DestinationStream }} [options]
 * @returns {import('pino').Logger}
 */
export function createLogger({ level = 'info', stream } = {}) {
  /** @type {import('pino').LoggerOptions} */
  const options = {
    level,
    base: undefined,
    mixin() {
      const context = currentContext();
      return context ? { bpId: context.bpId, userId: context.initiator?.id ?? null } : {};
    },
  };
  return stream ? pino(options, stream) : pino(options);
}
