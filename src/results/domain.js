import { Phase, phaseAt } from '../cycles/index.js';
import { DomainError } from '../platform/index.js';
import { ProjectStatus } from '../projects/index.js';

/**
 * @typedef {import('../cycles/index.js').Cycle} Cycle
 * @typedef {import('../projects/index.js').Project} Project
 * @typedef {import('../voting/index.js').VoteCounts} VoteCounts
 */

export class TallyError extends DomainError {
  code = 'tally_rejected';
}

/**
 * @typedef {Readonly<{
 *   projectId: number,
 *   votes: number,
 *   rank: number,
 *   funded: boolean,
 *   decidedAt: Date,
 * }>} Outcome
 * rank це місце в категорії, з 1.
 */

/**
 * Сценарій 4: переможці кожної категорії в межах її бюджету.
 * counts дає voting (countVotes): results не вирішує, який голос
 * зараховується, і не бачить окремих голосів.
 *
 * @param {Cycle} cycle
 * @param {ReadonlyArray<Project>} projects
 * @param {VoteCounts} counts
 * @param {Date} now
 * @returns {Outcome[]}
 */
export function tally(cycle, projects, counts, now) {
  if (phaseAt(cycle, now) !== Phase.RESULTS) {
    throw new TallyError('підрахунок можливий лише після кінця голосування');
  }
  /**
   * @param {Project} p
   * @returns {number}
   */
  const got = (p) => counts.get(p.id) ?? 0;

  /** @type {Outcome[]} */
  const outcomes = [];
  for (const limit of cycle.limits) {
    const candidates = projects
      .filter(
        (p) =>
          p.cycleId === cycle.id &&
          p.category === limit.category &&
          p.status === ProjectStatus.APPROVED,
      )
      // за рівності голосів вище раніше поданий, далі менший id
      .sort(
        (a, b) =>
          got(b) - got(a) ||
          a.submittedAt.getTime() - b.submittedAt.getTime() ||
          a.id - b.id,
      );
    let left = limit.budget;
    candidates.forEach((project, index) => {
      const funded = got(project) >= cycle.minVotes && project.cost <= left;
      if (funded) {
        left -= project.cost;
      }
      outcomes.push(
        Object.freeze({
          projectId: project.id,
          votes: got(project),
          rank: index + 1,
          funded,
          decidedAt: now,
        }),
      );
    });
  }
  return outcomes;
}
