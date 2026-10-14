export const Role = Object.freeze({
  RESIDENT: 'resident',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
});

/** @typedef {(typeof Role)[keyof typeof Role]} Role */

/**
 * @typedef {Readonly<{
 *   id: number,
 *   fullName: string,
 *   role: Role,
 *   verifiedAt: Date | null,
 * }>} User
 */

/**
 * @param {{ id: number, fullName: string, role: Role, verifiedAt?: Date | null }} fields
 * @returns {User}
 */
export function makeUser({ id, fullName, role, verifiedAt = null }) {
  return Object.freeze({ id, fullName, role, verifiedAt });
}

/**
 * @param {User} user
 * @returns {boolean}
 */
export function isVerified(user) {
  return user.verifiedAt !== null;
}
