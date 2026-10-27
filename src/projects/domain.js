import { Phase, limitFor, phaseAt } from '../cycles/index.js';
import { Role, isVerified } from '../identity/index.js';
import { DomainError } from '../platform/index.js';

/**
 * @typedef {import('../cycles/index.js').Category} Category
 * @typedef {import('../cycles/index.js').Cycle} Cycle
 * @typedef {import('../identity/index.js').User} User
 */

export const ProjectStatus = Object.freeze({
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

/** @typedef {(typeof ProjectStatus)[keyof typeof ProjectStatus]} ProjectStatus */

export const Decision = Object.freeze({ APPROVE: 'approve', REJECT: 'reject' });

/** @typedef {(typeof Decision)[keyof typeof Decision]} Decision */

export class SubmissionError extends DomainError {
  code = 'submission_rejected';
}

export class ReviewError extends DomainError {
  code = 'review_rejected';
}

/**
 * @typedef {Readonly<{
 *   id: number,
 *   cycleId: number,
 *   authorId: number,
 *   category: Category,
 *   title: string,
 *   cost: number,
 *   status: ProjectStatus,
 *   submittedAt: Date,
 * }>} Project
 */

/** @typedef {Readonly<Omit<Project, 'id'>>} ProjectDraft заявка до збереження */

/**
 * @typedef {Readonly<{
 *   projectId: number,
 *   moderatorId: number,
 *   decision: Decision,
 *   reason: string,
 *   decidedAt: Date,
 * }>} Review
 */

/**
 * Сценарій 1: подання заявки. id призначає сховище.
 *
 * @param {{
 *   cycle: Cycle,
 *   author: User,
 *   category: Category,
 *   title: string,
 *   cost: number,
 *   now: Date,
 * }} input
 * @returns {ProjectDraft}
 */
export function submit({ cycle, author, category, title, cost, now }) {
  if (!isVerified(author)) {
    throw new SubmissionError('автор не верифікований');
  }
  if (phaseAt(cycle, now) !== Phase.SUBMISSION) {
    throw new SubmissionError('подання заявок зараз закрите');
  }
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    throw new SubmissionError('назва проєкту порожня');
  }
  const { maxCost } = limitFor(cycle, category);
  if (!Number.isSafeInteger(cost) || cost <= 0 || cost > maxCost) {
    throw new SubmissionError(
      `вартість має бути від 1 коп. до ${maxCost} коп. для категорії ${category}`,
    );
  }
  return Object.freeze({
    cycleId: cycle.id,
    authorId: author.id,
    category,
    title: cleanTitle,
    cost,
    status: ProjectStatus.SUBMITTED,
    submittedAt: now,
  });
}

/**
 * Сценарій 2: рішення модератора; статус і Review змінюються разом.
 *
 * @param {Project} project
 * @param {{
 *   cycle: Cycle,
 *   moderator: User,
 *   decision: Decision,
 *   reason: string,
 *   now: Date,
 * }} input
 * @returns {{ project: Project, review: Review }}
 */
export function review(project, { cycle, moderator, decision, reason, now }) {
  if (moderator.role !== Role.MODERATOR) {
    throw new ReviewError('рішення ухвалює лише модератор', { kind: 'forbidden' });
  }
  if (project.cycleId !== cycle.id) {
    throw new ReviewError('проєкт з іншого раунду');
  }
  const phase = phaseAt(cycle, now);
  if (phase !== Phase.SUBMISSION && phase !== Phase.REVIEW) {
    throw new ReviewError('модерація можлива лише до початку голосування');
  }
  if (project.status !== ProjectStatus.SUBMITTED) {
    throw new ReviewError(`проєкт уже має статус ${project.status}`, {
      kind: 'conflict',
    });
  }
  if (decision === Decision.REJECT && !reason.trim()) {
    throw new ReviewError('для відхилення потрібна причина');
  }
  const status =
    decision === Decision.APPROVE ? ProjectStatus.APPROVED : ProjectStatus.REJECTED;
  return {
    project: Object.freeze({ ...project, status }),
    review: Object.freeze({
      projectId: project.id,
      moderatorId: moderator.id,
      decision,
      reason: reason.trim(),
      decidedAt: now,
    }),
  };
}
