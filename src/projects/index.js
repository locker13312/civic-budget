// заявки, модерація, статуси заявок
export {
  Decision,
  ProjectStatus,
  ReviewError,
  SubmissionError,
  review,
  submit,
} from './domain.js';
export { createMemoryProjectsRepository } from './repository.memory.js';
export { createPgProjectsRepository } from './repository.pg.js';
export { createProjectsService } from './service.js';

/** @typedef {import('./domain.js').Project} Project */
/** @typedef {import('./domain.js').ProjectDraft} ProjectDraft */
/** @typedef {import('./domain.js').Review} Review */
/** @typedef {import('./service.js').ProjectsService} ProjectsService */
/** @typedef {import('./service.js').ProjectsRepository} ProjectsRepository */
/** @typedef {import('./service.js').Idempotency} Idempotency */
/** @typedef {import('./service.js').ProjectWithAuthor} ProjectWithAuthor */
