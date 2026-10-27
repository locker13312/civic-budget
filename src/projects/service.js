import { requireUser } from '../identity/index.js';
import { NotFoundError, fingerprint } from '../platform/index.js';
import { review, submit } from './domain.js';

/**
 * @typedef {import('./domain.js').Project} Project
 * @typedef {import('./domain.js').ProjectDraft} ProjectDraft
 * @typedef {import('./domain.js').Review} Review
 * @typedef {import('./domain.js').Decision} Decision
 * @typedef {import('../cycles/index.js').Category} Category
 * @typedef {{ idempotencyKey: string | null, requestHash: string }} Idempotency
 * @typedef {{
 *   insertSubmission(draft: ProjectDraft, idempotency: Idempotency): Promise<{ project: Project, replayed: boolean }>,
 *   findById(id: number): Promise<Project | null>,
 *   findByIds(ids: ReadonlyArray<number>): Promise<Project[]>,
 *   listByCycle(cycleId: number): Promise<Project[]>,
 *   reviewOf(projectId: number): Promise<Review | null>,
 *   saveReview(project: Project, review: Review): Promise<void>,
 * }} ProjectsRepository
 * @typedef {Project & { author: { id: number, fullName: string } }} ProjectWithAuthor
 */

/**
 * @param {{
 *   projectsRepository: ProjectsRepository,
 *   cyclesService: import('../cycles/index.js').CyclesService,
 *   identityService: import('../identity/index.js').IdentityService,
 *   clock: import('../platform/index.js').Clock,
 *   logger: import('pino').Logger,
 * }} deps
 */
export function createProjectsService({
  projectsRepository,
  cyclesService,
  identityService,
  clock,
  logger,
}) {
  return {
    /**
     * @param {number} id
     * @returns {Promise<Project>}
     */
    async get(id) {
      const project = await projectsRepository.findById(id);
      if (!project) {
        throw new NotFoundError(`проєкт ${id} не знайдено`);
      }
      return project;
    },

    /**
     * Заявки одним запитом (для списків, без N+1).
     *
     * @param {ReadonlyArray<number>} ids
     * @returns {Promise<Map<number, Project>>}
     */
    async getMany(ids) {
      const projects = await projectsRepository.findByIds([...new Set(ids)]);
      return new Map(projects.map((project) => [project.id, project]));
    },

    /**
     * Заявка разом з рішенням модератора.
     *
     * @param {number} id
     * @returns {Promise<{ project: Project, review: Review | null }>}
     */
    async details(id) {
      const project = await this.get(id);
      return { project, review: await projectsRepository.reviewOf(id) };
    },

    /**
     * Заявки раунду в будь-якому статусі, без авторів (для voting і results).
     *
     * @param {number} cycleId
     * @returns {Promise<Project[]>}
     */
    async inCycle(cycleId) {
      return projectsRepository.listByCycle(cycleId);
    },

    /**
     * Заявки раунду з іменем автора.
     *
     * @param {number} cycleId
     * @returns {Promise<ProjectWithAuthor[]>}
     */
    async listByCycle(cycleId) {
      await cyclesService.get(cycleId);
      const projects = await projectsRepository.listByCycle(cycleId);
      // автори всіх заявок одним запитом, а не по одному на заявку (аудит, п. 1)
      const authors = await identityService.findByIds(projects.map((p) => p.authorId));
      return projects.map((project) => ({
        ...project,
        author: {
          id: project.authorId,
          fullName: authors.get(project.authorId)?.fullName ?? '',
        },
      }));
    },

    /**
     * Сценарій 1. Повтор з тим самим Idempotency-Key повертає ту саму заявку.
     *
     * @param {number} cycleId
     * @param {{ category: Category, title: string, cost: number }} input
     * @param {string | null} idempotencyKey
     * @returns {Promise<{ project: Project, replayed: boolean }>}
     */
    async submit(cycleId, input, idempotencyKey) {
      const author = requireUser('resident');
      const cycle = await cyclesService.get(cycleId);
      const draft = submit({ cycle, author, ...input, now: clock.now() });
      const result = await projectsRepository.insertSubmission(draft, {
        idempotencyKey,
        requestHash: fingerprint({ cycleId, ...input }),
      });
      logger.info(
        { projectId: result.project.id, replayed: result.replayed },
        'заявку подано',
      );
      return result;
    },

    /**
     * Сценарій 2. Статус і Review змінюються разом (транзакція в репозиторії).
     *
     * @param {number} projectId
     * @param {{ decision: Decision, reason: string }} input
     * @returns {Promise<Review>}
     */
    async review(projectId, input) {
      const moderator = requireUser('moderator');
      const project = await this.get(projectId);
      const cycle = await cyclesService.get(project.cycleId);
      const decided = review(project, { cycle, moderator, ...input, now: clock.now() });
      await projectsRepository.saveReview(decided.project, decided.review);
      logger.info({ projectId, decision: input.decision }, 'рішення модератора');
      return decided.review;
    },
  };
}

/** @typedef {ReturnType<typeof createProjectsService>} ProjectsService */
