// раунд громадського бюджету: фази, дати, бюджети категорій
export {
  Category,
  CycleError,
  Phase,
  limitFor,
  makeCategoryLimit,
  makeCycle,
  phaseAt,
} from './domain.js';

/** @typedef {import('./domain.js').Cycle} Cycle */
/** @typedef {import('./domain.js').CategoryLimit} CategoryLimit */
