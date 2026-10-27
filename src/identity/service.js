import { DomainError } from '../platform/index.js';
import { Role } from './domain.js';

/**
 * @typedef {import('./domain.js').User} User
 * @typedef {{ fullName: string, role: User['role'], verifiedAt: Date | null, taxIdHash: string }} NewUser
 * @typedef {{
 *   insert(user: NewUser): Promise<User>,
 *   findById(id: number): Promise<User | null>,
 * }} IdentityRepository
 */

/**
 * @param {{ identityRepository: IdentityRepository }} deps
 */
export function createIdentityService({ identityRepository }) {
  return {
    /**
     * @param {number} id
     * @returns {Promise<User | null>}
     */
    async findById(id) {
      return identityRepository.findById(id);
    },

    /**
     * Лише для статичних даних і тестів: через API користувачів не створюють.
     *
     * @param {NewUser} user
     * @returns {Promise<User>}
     */
    async register(user) {
      if (!user.fullName.trim()) {
        throw new DomainError("ім'я користувача порожнє");
      }
      if (!Object.values(Role).includes(user.role)) {
        throw new DomainError(`невідома роль ${user.role}`);
      }
      return identityRepository.insert({ ...user, fullName: user.fullName.trim() });
    },
  };
}

/** @typedef {ReturnType<typeof createIdentityService>} IdentityService */
