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

export class ProgressError extends DomainError {
  code = 'progress_rejected';
}

/**
 * @typedef {Readonly<{
 *   id: number,
 *   projectId: number,
 *   spent: number,
 *   note: string,
 *   reportedAt: Date,
 * }>} ProgressReport
 * spent у копійках.
 */

/** @typedef {Readonly<Omit<ProgressReport, 'id'>>} ProgressDraft звіт до збереження */

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

/**
 * Сценарій 5: звіт про реалізацію переможця; витрати не перевищують вартість.
 *
 * @param {{
 *   outcome: Outcome | null,
 *   project: Project,
 *   reports: ReadonlyArray<ProgressReport>,
 *   spent: number,
 *   note: string,
 *   now: Date,
 * }} input
 * @returns {ProgressDraft}
 */
export function reportProgress({ outcome, project, reports, spent, note, now }) {
  if (!outcome?.funded) {
    throw new ProgressError('звіт можливий лише для проєкту-переможця');
  }
  if (!Number.isSafeInteger(spent) || spent <= 0) {
    throw new ProgressError('сума витрат має бути цілим додатним числом копійок');
  }
  const spentBefore = reports.reduce((sum, report) => sum + report.spent, 0);
  if (spentBefore + spent > project.cost) {
    throw new ProgressError(
      `витрати ${spentBefore + spent} коп. перевищують вартість проєкту ${project.cost} коп.`,
    );
  }
  return Object.freeze({
    projectId: project.id,
    spent,
    note: note.trim(),
    reportedAt: now,
  });
}
