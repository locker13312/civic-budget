import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  Category,
  CycleError,
  Phase,
  makeCategoryLimit,
  makeCycle,
  phaseAt,
} from '../../src/cycles/index.js';
import {
  IN_RESULTS,
  IN_REVIEW,
  IN_SUBMISSION,
  IN_VOTING,
  T0,
  testCycle,
} from '../helpers.js';

describe('[AC-1.7] раунд', () => {
  test('фаза визначається датами раунду', () => {
    const cycle = testCycle();
    const cases = [
      [new Date(T0.getTime() - 1000), Phase.PLANNED],
      [T0, Phase.SUBMISSION],
      [IN_SUBMISSION, Phase.SUBMISSION],
      [IN_REVIEW, Phase.REVIEW],
      [IN_VOTING, Phase.VOTING],
      [IN_RESULTS, Phase.RESULTS],
    ];
    for (const [moment, phase] of cases) {
      assert.equal(phaseAt(cycle, /** @type {Date} */ (moment)), phase);
    }
  });

  test('фази не можуть перекриватися', () => {
    const cycle = testCycle();
    assert.throws(
      () =>
        makeCycle({
          ...cycle,
          id: 2,
          submissionTo: cycle.votingFrom,
          votingFrom: cycle.submissionTo,
          limits: [...cycle.limits],
        }),
      CycleError,
    );
  });

  test('максимальна вартість не більша за бюджет категорії', () => {
    assert.throws(() => makeCategoryLimit(Category.SMALL, 100, 101), CycleError);
  });
});
