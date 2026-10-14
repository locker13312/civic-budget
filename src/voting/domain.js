import { Phase, phaseAt } from '../cycles/index.js';
import { isVerified } from '../identity/index.js';
import { DomainError } from '../platform/index.js';
import { ProjectStatus } from '../projects/index.js';

/**
 * @typedef {import('../cycles/index.js').Cycle} Cycle
 * @typedef {import('../identity/index.js').User} User
 * @typedef {import('../projects/index.js').Project} Project
 */

export class VoteError extends DomainError {
  code = 'vote_rejected';
}

/**
 * @typedef {Readonly<{
 *   voterId: number,
 *   projectId: number,
 *   cycleId: number,
 *   castAt: Date,
 * }>} Vote
 */

/**
 * Сценарій 3: голос мешканця. voterVotes це вже віддані голоси виборця.
 *
 * @param {{
 *   voter: User,
 *   project: Project,
 *   cycle: Cycle,
 *   voterVotes: ReadonlyArray<Vote>,
 *   now: Date,
 * }} input
 * @returns {Vote}
 */
export function castVote({ voter, project, cycle, voterVotes, now }) {
  if (!isVerified(voter)) {
    throw new VoteError('голосувати можуть лише верифіковані мешканці');
  }
  if (phaseAt(cycle, now) !== Phase.VOTING) {
    throw new VoteError('голосування зараз закрите');
  }
  if (project.cycleId !== cycle.id || project.status !== ProjectStatus.APPROVED) {
    throw new VoteError('за цей проєкт не можна голосувати');
  }
  const inCycle = voterVotes.filter((v) => v.cycleId === cycle.id);
  if (inCycle.some((v) => v.projectId === project.id)) {
    throw new VoteError('ви вже голосували за цей проєкт');
  }
  if (inCycle.length >= cycle.maxVotes) {
    throw new VoteError(`вичерпано ліміт: ${cycle.maxVotes} голосів на раунд`);
  }
  return Object.freeze({
    voterId: voter.id,
    projectId: project.id,
    cycleId: cycle.id,
    castAt: now,
  });
}

/**
 * Кількість зарахованих голосів: projectId -> голоси.
 *
 * @typedef {ReadonlyMap<number, number>} VoteCounts
 */

/**
 * Зараховані голоси раунду; правило зарахування живе лише тут.
 *
 * @param {Iterable<Vote>} votes
 * @param {number} cycleId
 * @returns {VoteCounts}
 */
export function countVotes(votes, cycleId) {
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (const vote of votes) {
    if (vote.cycleId === cycleId) {
      counts.set(vote.projectId, (counts.get(vote.projectId) ?? 0) + 1);
    }
  }
  return counts;
}
