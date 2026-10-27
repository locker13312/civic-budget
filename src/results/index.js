// підрахунок голосів, переможці, хід реалізації
export { ProgressError, TallyError, reportProgress, tally } from './domain.js';
export { createMemoryResultsRepository } from './repository.memory.js';
export { createResultsService } from './service.js';

/** @typedef {import('./domain.js').Outcome} Outcome */
/** @typedef {import('./domain.js').ProgressReport} ProgressReport */
/** @typedef {import('./domain.js').ProgressDraft} ProgressDraft */
/** @typedef {import('./service.js').ResultsService} ResultsService */
/** @typedef {import('./service.js').ResultsRepository} ResultsRepository */
