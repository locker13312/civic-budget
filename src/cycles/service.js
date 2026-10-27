import { NotFoundError, requireInitiator } from '../platform/index.js';
import { makeCategoryLimit, makeCycle, phaseAt } from './domain.js';

/**
 * @typedef {import('./domain.js').Cycle} Cycle
 * @typedef {import('./domain.js').Category} Category
 * @typedef {import('./domain.js').Phase} Phase
 * @typedef {Omit<Cycle, 'id'>} CycleDraft
 * @typedef {{
 *   insert(draft: CycleDraft): Promise<Cycle>,
 *   findById(id: number): Promise<Cycle | null>,
 *   list(): Promise<Cycle[]>,
 * }} CyclesRepository
 * @typedef {{
 *   title: string,
 *   submissionFrom: Date,
 *   submissionTo: Date,
 *   votingFrom: Date,
 *   votingTo: Date,
 *   maxVotes: number,
 *   minVotes: number,
 *   limits: Array<{ category: Category, budget: number, maxCost: number }>,
 * }} NewCycle
 */

/**
 * @param {{ cyclesRepository: CyclesRepository, clock: import('../platform/index.js').Clock }} deps
 */
export function createCyclesService({ cyclesRepository, clock }) {
  /**
   * @param {Cycle} cycle
   * @returns {Cycle & { phase: Phase }}
   */
  const withPhase = (cycle) => ({ ...cycle, phase: phaseAt(cycle, clock.now()) });

  return {
    /** @returns {Promise<Array<Cycle & { phase: Phase }>>} */
    async list() {
      return (await cyclesRepository.list()).map(withPhase);
    },

    /**
     * @param {number} id
     * @returns {Promise<Cycle>}
     */
    async get(id) {
      const cycle = await cyclesRepository.findById(id);
      if (!cycle) {
        throw new NotFoundError(`раунд ${id} не знайдено`);
      }
      return cycle;
    },

    /**
     * @param {number} id
     * @returns {Promise<Cycle & { phase: Phase }>}
     */
    async getWithPhase(id) {
      return withPhase(await this.get(id));
    },

    /**
     * Створення раунду адміністратором; правила дат і лімітів — у makeCycle.
     *
     * @param {NewCycle} input
     * @returns {Promise<Cycle & { phase: Phase }>}
     */
    async create(input) {
      requireInitiator('admin');
      const limits = input.limits.map((l) =>
        makeCategoryLimit(l.category, l.budget, l.maxCost),
      );
      // makeCycle перевіряє правила раунду; id призначить сховище
      const { id, ...draft } = makeCycle({
        ...input,
        id: 0,
        title: input.title.trim(),
        limits,
      });
      void id;
      return withPhase(await cyclesRepository.insert(draft));
    },
  };
}

/** @typedef {ReturnType<typeof createCyclesService>} CyclesService */
