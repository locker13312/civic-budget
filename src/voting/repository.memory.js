import { ConflictError } from '../platform/index.js';
import { countVotes } from './domain.js';

/**
 * Статичні дані прототипу: голоси в пам'яті процесу. castVote синхронний
 * усередині, тож перевірка ліміту і вставка не розриваються іншим запитом.
 *
 * @returns {import('./service.js').VotingRepository}
 */
export function createMemoryVotingRepository() {
  /** @type {import('./domain.js').Vote[]} */
  const votes = [];

  return {
    async castVote({ voterId, cycleId }, decide) {
      const voterVotes = votes.filter(
        (v) => v.voterId === voterId && v.cycleId === cycleId,
      );
      const vote = decide(voterVotes);
      if (
        votes.some((v) => v.voterId === vote.voterId && v.projectId === vote.projectId)
      ) {
        throw new ConflictError('ви вже голосували за цей проєкт');
      }
      votes.push(vote);
      return vote;
    },
    async byVoter(voterId, cycleId) {
      return votes.filter((v) => v.voterId === voterId && v.cycleId === cycleId);
    },
    async countsForCycle(cycleId) {
      return countVotes(votes, cycleId);
    },
  };
}
