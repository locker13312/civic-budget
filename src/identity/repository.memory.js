import { ConflictError } from '../platform/index.js';

/**
 * Статичні дані прототипу: користувачі в пам'яті процесу.
 *
 * @returns {import('./service.js').IdentityRepository}
 */
export function createMemoryIdentityRepository() {
  /** @type {Map<number, import('./domain.js').User>} */
  const users = new Map();
  /** @type {Set<string>} */
  const taxIds = new Set();
  let nextId = 1;

  return {
    async insert({ taxIdHash, ...fields }) {
      if (taxIds.has(taxIdHash)) {
        throw new ConflictError('користувач з таким податковим номером уже є');
      }
      taxIds.add(taxIdHash);
      const user = Object.freeze({ id: nextId++, ...fields });
      users.set(user.id, user);
      return user;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
  };
}
