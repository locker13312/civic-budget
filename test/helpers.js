import { Category, makeCategoryLimit, makeCycle } from '../src/cycles/index.js';
import { Role, makeUser } from '../src/identity/index.js';

const DAY = 24 * 60 * 60 * 1000;

export const T0 = new Date('2026-03-01T00:00:00Z');

/**
 * @param {Date} base
 * @param {number} days
 * @returns {Date}
 */
export function addDays(base, days) {
  return new Date(base.getTime() + days * DAY);
}

// моменти всередині кожної фази тестового раунду
export const IN_SUBMISSION = addDays(T0, 10);
export const IN_REVIEW = addDays(T0, 35);
export const IN_VOTING = addDays(T0, 50);
export const IN_RESULTS = addDays(T0, 70);

/**
 * @param {{ id?: number, maxVotes?: number, minVotes?: number, smallBudget?: number, smallMaxCost?: number }} [options]
 */
export function testCycle({
  id = 1,
  maxVotes = 2,
  minVotes = 2,
  smallBudget = 100_000,
  smallMaxCost = 60_000,
} = {}) {
  return makeCycle({
    id,
    title: 'Громадський бюджет 2026',
    submissionFrom: T0,
    submissionTo: addDays(T0, 30),
    votingFrom: addDays(T0, 45),
    votingTo: addDays(T0, 60),
    maxVotes,
    minVotes,
    limits: [
      makeCategoryLimit(Category.SMALL, smallBudget, smallMaxCost),
      makeCategoryLimit(Category.LARGE, 1_000_000, 500_000),
    ],
  });
}

/**
 * @param {number} [id]
 * @param {import('../src/identity/index.js').Role} [role]
 * @param {{ verified?: boolean }} [options]
 */
export function testUser(id = 1, role = Role.RESIDENT, { verified = true } = {}) {
  return makeUser({
    id,
    fullName: `Користувач ${id}`,
    role,
    verifiedAt: verified ? addDays(T0, -1) : null,
  });
}
