import { requireUser } from '../identity/index.js';
import { fingerprint } from '../platform/index.js';
import { reportProgress, tally } from './domain.js';

/**
 * @typedef {import('./domain.js').Outcome} Outcome
 * @typedef {import('./domain.js').ProgressReport} ProgressReport
 * @typedef {import('./domain.js').ProgressDraft} ProgressDraft
 * @typedef {import('../projects/index.js').Idempotency} Idempotency
 * @typedef {{
 *   replaceOutcomes(cycleId: number, outcomes: ReadonlyArray<Outcome>): Promise<void>,
 *   byCycle(cycleId: number): Promise<Outcome[]>,
 *   outcomeOf(projectId: number): Promise<Outcome | null>,
 *   addProgress(
 *     intent: { projectId: number, reporterId: number },
 *     decide: (reports: ReadonlyArray<ProgressReport>) => ProgressDraft,
 *     idempotency: Idempotency,
 *   ): Promise<{ report: ProgressReport, replayed: boolean }>,
 *   progressOf(projectId: number): Promise<ProgressReport[]>,
 * }} ResultsRepository
 */

/**
 * @param {{
 *   resultsRepository: ResultsRepository,
 *   votingService: import('../voting/index.js').VotingService,
 *   projectsService: import('../projects/index.js').ProjectsService,
 *   cyclesService: import('../cycles/index.js').CyclesService,
 *   clock: import('../platform/index.js').Clock,
 *   logger: import('pino').Logger,
 * }} deps
 */
export function createResultsService({
  resultsRepository,
  votingService,
  projectsService,
  cyclesService,
  clock,
  logger,
}) {
  return {
    /**
     * Сценарій 4. Повторний запуск перезаписує ті самі підсумки.
     *
     * @param {number} cycleId
     * @returns {Promise<Outcome[]>}
     */
    async tally(cycleId) {
      requireUser('admin');
      const cycle = await cyclesService.get(cycleId);
      const projects = await projectsService.inCycle(cycleId);
      const counts = await votingService.countsForCycle(cycleId);
      const outcomes = tally(cycle, projects, counts, clock.now());
      await resultsRepository.replaceOutcomes(cycleId, outcomes);
      logger.info(
        { cycleId, funded: outcomes.filter((o) => o.funded).length },
        'підсумки',
      );
      return outcomes;
    },

    /**
     * Підсумки раунду з назвами проєктів.
     *
     * @param {number} cycleId
     * @returns {Promise<Array<Outcome & { title: string, category: string }>>}
     */
    async results(cycleId) {
      await cyclesService.get(cycleId);
      const outcomes = await resultsRepository.byCycle(cycleId);
      return Promise.all(
        outcomes.map(async (outcome) => {
          const project = await projectsService.get(outcome.projectId);
          return { ...outcome, title: project.title, category: project.category };
        }),
      );
    },

    /**
     * Сценарій 5. Сума звітів не перевищує вартість; перевірка і вставка в
     * одній транзакції репозиторію.
     *
     * @param {number} projectId
     * @param {{ spent: number, note: string }} input
     * @param {string | null} idempotencyKey
     * @returns {Promise<{ report: ProgressReport, replayed: boolean }>}
     */
    async addProgress(projectId, input, idempotencyKey) {
      const reporter = requireUser('admin');
      const project = await projectsService.get(projectId);
      const outcome = await resultsRepository.outcomeOf(projectId);
      const now = clock.now();
      const result = await resultsRepository.addProgress(
        { projectId, reporterId: reporter.id },
        (reports) => reportProgress({ outcome, project, reports, ...input, now }),
        { idempotencyKey, requestHash: fingerprint({ projectId, ...input }) },
      );
      logger.info({ projectId, replayed: result.replayed }, 'звіт про реалізацію');
      return result;
    },

    /**
     * @param {number} projectId
     * @returns {Promise<ProgressReport[]>}
     */
    async progress(projectId) {
      await projectsService.get(projectId);
      return resultsRepository.progressOf(projectId);
    },
  };
}

/** @typedef {ReturnType<typeof createResultsService>} ResultsService */
