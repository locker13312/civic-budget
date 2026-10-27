// контекст бізнес-процесу (запиту): bpId і користувач-ініціатор доступні з
// будь-якого рівня без передачі параметрами (adr/0008). Що таке користувач,
// знає identity; тут він лише лежить у контексті.
import { AsyncLocalStorage } from 'node:async_hooks';

import { ForbiddenError, UnauthenticatedError } from './errors.js';

/**
 * @typedef {{ id: number, role: string }} Initiator
 * @typedef {{ bpId: string, initiator: Initiator | null, queries: number }} RequestContext
 */

/** @type {AsyncLocalStorage<RequestContext>} */
const storage = new AsyncLocalStorage();

/**
 * Запускає fn у новому контексті бізнес-процесу.
 *
 * @template T
 * @param {{ bpId: string, initiator?: Initiator | null }} init
 * @param {() => T} fn
 * @returns {T}
 */
export function runInContext(init, fn) {
  return storage.run(
    { bpId: init.bpId, initiator: init.initiator ?? null, queries: 0 },
    fn,
  );
}

/** @returns {RequestContext | undefined} */
export function currentContext() {
  return storage.getStore();
}

/**
 * Записує ініціатора в поточний контекст (після автентифікації).
 *
 * @param {Initiator} initiator
 */
export function setInitiator(initiator) {
  const store = storage.getStore();
  if (!store) {
    throw new Error('setInitiator поза контекстом бізнес-процесу');
  }
  store.initiator = initiator;
}

/** Лічильник запитів до БД у поточному бізнес-процесі (для перевірки N+1). */
export function countQuery() {
  const store = storage.getStore();
  if (store) {
    store.queries += 1;
  }
}

/**
 * Ініціатор поточного бізнес-процесу; без нього або з іншою роллю операція
 * недоступна. Перевірка доступу для модулів, нижчих за identity.
 *
 * @param {...string} roles дозволені ролі; без аргументів — будь-яка
 * @returns {Initiator}
 */
export function requireInitiator(...roles) {
  const initiator = storage.getStore()?.initiator ?? null;
  if (!initiator) {
    throw new UnauthenticatedError('потрібен заголовок X-User-Id');
  }
  if (roles.length > 0 && !roles.includes(initiator.role)) {
    throw new ForbiddenError(`операція доступна ролям: ${roles.join(', ')}`);
  }
  return initiator;
}
