import { requireUser } from '../identity/index.js';
import { castVote } from './domain.js';

/**
 * @typedef {import('./domain.js').Vote} Vote
 * @typedef {import('./domain.js').VoteCounts} VoteCounts
 * @typedef {{
 *   castVote(
 *     intent: { voterId: number, cycleId: number },
 *     decide: (voterVotes: ReadonlyArray<Vote>) => Vote,
 *   ): Promise<Vote>,
 *   byVoter(voterId: number, cycleId: number): Promise<Vote[]>,
 *   countsForCycle(cycleId: number): Promise<VoteCounts>,
 * }} VotingRepository
 */

/**
 * @param {{
 *   votingRepository: VotingRepository,
 *   projectsService: import('../projects/index.js').ProjectsService,
 *   cyclesService: import('../cycles/index.js').CyclesService,
 *   clock: import('../platform/index.js').Clock,
 *   logger: import('pino').Logger,
 * }} deps
 */
export function createVotingService({
  votingRepository,
  projectsService,
  cyclesService,
  clock,
  logger,
}) {
  return {
    /**
     * Сценарій 3. Перевірку правил і вставку репозиторій виконує атомарно:
     * decide отримує голоси виборця, прочитані в тій самій транзакції.
     *
     * @param {number} projectId
     * @returns {Promise<Vote>}
     */
    async cast(projectId) {
      const voter = requireUser('resident');
      const project = await projectsService.get(projectId);
      const cycle = await cyclesService.get(project.cycleId);
      const now = clock.now();
      const vote = await votingRepository.castVote(
        { voterId: voter.id, cycleId: cycle.id },
        (voterVotes) => castVote({ voter, project, cycle, voterVotes, now }),
      );
      logger.info({ projectId }, 'голос прийнято');
      return vote;
    },

    /**
     * @param {number} cycleId
     * @returns {Promise<Vote[]>}
     */
    async myVotes(cycleId) {
      const voter = requireUser();
      await cyclesService.get(cycleId);
      return votingRepository.byVoter(voter.id, cycleId);
    },

    /**
     * Зараховані голоси раунду; правило зарахування живе лише в voting.
     *
     * @param {number} cycleId
     * @returns {Promise<VoteCounts>}
     */
    async countsForCycle(cycleId) {
      return votingRepository.countsForCycle(cycleId);
    },

    /**
     * Заявки раунду з автором і поточною кількістю голосів.
     *
     * @param {number} cycleId
     * @returns {Promise<Array<import('../projects/index.js').ProjectWithAuthor & { votes: number }>>}
     */
    async listWithCounts(cycleId) {
      const projects = await projectsService.listByCycle(cycleId);
      const counts = await votingRepository.countsForCycle(cycleId);
      return projects.map((project) => ({
        ...project,
        votes: counts.get(project.id) ?? 0,
      }));
    },
  };
}

/** @typedef {ReturnType<typeof createVotingService>} VotingService */
