import { makeCycle } from './domain.js';

/**
 * Статичні дані прототипу: раунди в пам'яті процесу.
 *
 * @returns {import('./service.js').CyclesRepository}
 */
export function createMemoryCyclesRepository() {
  /** @type {Map<number, import('./domain.js').Cycle>} */
  const cycles = new Map();
  let nextId = 1;

  return {
    async insert(draft) {
      const cycle = makeCycle({ ...draft, id: nextId++, limits: [...draft.limits] });
      cycles.set(cycle.id, cycle);
      return cycle;
    },
    async findById(id) {
      return cycles.get(id) ?? null;
    },
    async list() {
      return [...cycles.values()];
    },
  };
}
