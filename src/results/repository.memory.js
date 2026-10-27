import { ConflictError } from '../platform/index.js';

/**
 * @typedef {import('./domain.js').Outcome} Outcome
 * @typedef {import('./domain.js').ProgressReport} ProgressReport
 */

/**
 * Статичні дані прототипу: підсумки і звіти в пам'яті процесу.
 *
 * @returns {import('./service.js').ResultsRepository}
 */
export function createMemoryResultsRepository() {
  /** @type {Map<number, Outcome[]>} */
  const outcomesByCycle = new Map();
  /** @type {ProgressReport[]} */
  const reports = [];
  /** @type {Map<string, { reportId: number, requestHash: string }>} */
  const keys = new Map();
  let nextId = 1;

  return {
    async replaceOutcomes(cycleId, outcomes) {
      outcomesByCycle.set(cycleId, [...outcomes]);
    },
    async byCycle(cycleId) {
      return [...(outcomesByCycle.get(cycleId) ?? [])];
    },
    async outcomeOf(projectId) {
      for (const outcomes of outcomesByCycle.values()) {
        const found = outcomes.find((o) => o.projectId === projectId);
        if (found) {
          return found;
        }
      }
      return null;
    },
    async addProgress(
      { projectId, reporterId },
      decide,
      { idempotencyKey, requestHash },
    ) {
      const keyId = idempotencyKey ? `${reporterId}:${idempotencyKey}` : null;
      const known = keyId ? keys.get(keyId) : undefined;
      if (known) {
        if (known.requestHash !== requestHash) {
          throw new ConflictError('Idempotency-Key уже використано з іншим тілом запиту');
        }
        const report = /** @type {ProgressReport} */ (
          reports.find((r) => r.id === known.reportId)
        );
        return { report, replayed: true };
      }
      const draft = decide(reports.filter((r) => r.projectId === projectId));
      const report = Object.freeze({ id: nextId++, ...draft });
      reports.push(report);
      if (keyId) {
        keys.set(keyId, { reportId: report.id, requestHash });
      }
      return { report, replayed: false };
    },
    async progressOf(projectId) {
      return reports.filter((r) => r.projectId === projectId);
    },
  };
}
