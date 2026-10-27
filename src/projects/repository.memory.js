import { ConflictError } from '../platform/index.js';
import { ProjectStatus } from './domain.js';

/**
 * @typedef {import('./domain.js').Project} Project
 * @typedef {import('./domain.js').Review} Review
 */

/**
 * Статичні дані прототипу: заявки і рішення в пам'яті процесу. Кожен метод
 * синхронний усередині, тож у межах одного процесу він атомарний.
 *
 * @returns {import('./service.js').ProjectsRepository}
 */
export function createMemoryProjectsRepository() {
  /** @type {Map<number, Project>} */
  const projects = new Map();
  /** @type {Map<number, Review>} */
  const reviews = new Map();
  /** @type {Map<string, { projectId: number, requestHash: string }>} */
  const keys = new Map();
  let nextId = 1;

  return {
    async insertSubmission(draft, { idempotencyKey, requestHash }) {
      const keyId = idempotencyKey ? `${draft.authorId}:${idempotencyKey}` : null;
      const known = keyId ? keys.get(keyId) : undefined;
      if (known) {
        if (known.requestHash !== requestHash) {
          throw new ConflictError('Idempotency-Key уже використано з іншим тілом запиту');
        }
        return {
          project: /** @type {Project} */ (projects.get(known.projectId)),
          replayed: true,
        };
      }
      const project = Object.freeze({ ...draft, id: nextId++ });
      projects.set(project.id, project);
      if (keyId) {
        keys.set(keyId, { projectId: project.id, requestHash });
      }
      return { project, replayed: false };
    },
    async findById(id) {
      return projects.get(id) ?? null;
    },
    async findByIds(ids) {
      return ids.flatMap((id) => projects.get(id) ?? []);
    },
    async listByCycle(cycleId) {
      return [...projects.values()].filter((p) => p.cycleId === cycleId);
    },
    async reviewOf(projectId) {
      return reviews.get(projectId) ?? null;
    },
    async saveReview(project, review) {
      const current = projects.get(project.id);
      if (current?.status !== ProjectStatus.SUBMITTED || reviews.has(project.id)) {
        throw new ConflictError('проєкт уже розглянуто');
      }
      reviews.set(project.id, review);
      projects.set(project.id, project);
    },
  };
}
