import { DomainError } from '../platform/errors.js';

export const Phase = Object.freeze({
  PLANNED: 'planned',
  SUBMISSION: 'submission',
  REVIEW: 'review',
  VOTING: 'voting',
  RESULTS: 'results',
});

/** @typedef {(typeof Phase)[keyof typeof Phase]} Phase */

export const Category = Object.freeze({ SMALL: 'small', LARGE: 'large' });

/** @typedef {(typeof Category)[keyof typeof Category]} Category */

export class CycleError extends DomainError {
  code = 'invalid_cycle';
}

/**
 * @typedef {Readonly<{ category: Category, budget: number, maxCost: number }>} CategoryLimit
 * Гроші в копійках.
 */

/**
 * @typedef {Readonly<{
 *   id: number,
 *   title: string,
 *   submissionFrom: Date,
 *   submissionTo: Date,
 *   votingFrom: Date,
 *   votingTo: Date,
 *   maxVotes: number,
 *   minVotes: number,
 *   limits: ReadonlyArray<CategoryLimit>,
 * }>} Cycle
 */

/**
 * @param {Category} category
 * @param {number} budget
 * @param {number} maxCost
 * @returns {CategoryLimit}
 */
export function makeCategoryLimit(category, budget, maxCost) {
  if (!(budget > 0) || !(maxCost > 0)) {
    throw new CycleError('бюджет і максимальна вартість мають бути додатні');
  }
  if (maxCost > budget) {
    throw new CycleError('максимальна вартість більша за бюджет категорії');
  }
  return Object.freeze({ category, budget, maxCost });
}

/**
 * @param {Omit<Cycle, 'limits'> & { limits: CategoryLimit[] }} fields
 * @returns {Cycle}
 */
export function makeCycle(fields) {
  const dates = [
    fields.submissionFrom,
    fields.submissionTo,
    fields.votingFrom,
    fields.votingTo,
  ];
  for (let i = 1; i < dates.length; i += 1) {
    if (dates[i - 1].getTime() >= dates[i].getTime()) {
      throw new CycleError('фази раунду мають іти по черзі без перекриття');
    }
  }
  if (fields.maxVotes < 1 || fields.minVotes < 0) {
    throw new CycleError("max_votes має бути не менше 1, min_votes не від'ємний");
  }
  const categories = fields.limits.map((limit) => limit.category);
  if (new Set(categories).size !== categories.length) {
    throw new CycleError('ліміт для категорії задано двічі');
  }
  return Object.freeze({ ...fields, limits: Object.freeze([...fields.limits]) });
}

/**
 * @param {Cycle} cycle
 * @param {Date} moment
 * @returns {Phase}
 */
export function phaseAt(cycle, moment) {
  const t = moment.getTime();
  if (t < cycle.submissionFrom.getTime()) {
    return Phase.PLANNED;
  }
  if (t < cycle.submissionTo.getTime()) {
    return Phase.SUBMISSION;
  }
  if (t < cycle.votingFrom.getTime()) {
    return Phase.REVIEW;
  }
  if (t < cycle.votingTo.getTime()) {
    return Phase.VOTING;
  }
  return Phase.RESULTS;
}

/**
 * @param {Cycle} cycle
 * @param {Category} category
 * @returns {CategoryLimit}
 */
export function limitFor(cycle, category) {
  const limit = cycle.limits.find((item) => item.category === category);
  if (!limit) {
    throw new CycleError(`у раунді немає категорії ${category}`);
  }
  return limit;
}
