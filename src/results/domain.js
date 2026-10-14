import { Phase, phaseAt } from '../cycles/domain.js';
import { DomainError } from '../platform/errors.js';
import { ProjectStatus } from '../projects/domain.js';
import { countVotes } from '../voting/domain.js';

/**
 * @typedef {import('../cycles/domain.js').Cycle} Cycle
 * @typedef {import('../projects/domain.js').Project} Project
 * @typedef {import('../voting/domain.js').Vote} Vote
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
 *
 * @param {Cycle} cycle
 * @param {ReadonlyArray<Project>} projects
 * @param {ReadonlyArray<Vote>} votes
 * @param {Date} now
 * @returns {Outcome[]}
 */
export function tally(cycle, projects, votes, now) {
  if (phaseAt(cycle, now) !== Phase.RESULTS) {
    throw new TallyError('підрахунок можливий лише після кінця голосування');
  }
  const counts = countVotes(votes.filter((v) => v.cycleId === cycle.id));
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
