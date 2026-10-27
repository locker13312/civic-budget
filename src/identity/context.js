import { requireInitiator } from '../platform/index.js';

/** @typedef {import('./domain.js').User} User */

/**
 * Користувач-ініціатор; без нього або з іншою роллю операція недоступна.
 * У контекст ініціатора кладе лише web після identity.findById, тож це User.
 *
 * @param {...import('./domain.js').Role} roles дозволені ролі; без аргументів — будь-яка
 * @returns {User}
 */
export function requireUser(...roles) {
  return /** @type {User} */ (requireInitiator(...roles));
}
