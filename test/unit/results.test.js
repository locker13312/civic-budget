import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Category } from '../../src/cycles/index.js';
import { ProjectStatus } from '../../src/projects/index.js';
import { TallyError, tally } from '../../src/results/index.js';
import { IN_RESULTS, IN_SUBMISSION, IN_VOTING, testCycle } from '../helpers.js';

/**
 * @param {number} id
 * @param {number} cost
 * @param {{ status?: import('../../src/projects/index.js').ProjectStatus, minutes?: number }} [options]
 * @returns {import('../../src/projects/index.js').Project}
 */
function project(id, cost, { status = ProjectStatus.APPROVED, minutes = 0 } = {}) {
  return Object.freeze({
    id,
    cycleId: 1,
    authorId: 1,
    category: Category.SMALL,
    title: `Проєкт ${id}`,
    cost,
    status,
    submittedAt: new Date(IN_SUBMISSION.getTime() + minutes * 60_000),
  });
}

/**
 * @param {number} projectId
 * @param {number} n
 */
function votes(projectId, n) {
  return Array.from({ length: n }, (_, i) =>
    Object.freeze({ voterId: 1000 + i, projectId, cycleId: 1, castAt: IN_VOTING }),
  );
}

/** @param {import('../../src/results/index.js').Outcome[]} outcomes */
function funded(outcomes) {
  return new Set(outcomes.filter((o) => o.funded).map((o) => o.projectId));
}

describe('[AC-1.7] підсумки', () => {
  test('переможці заповнюють бюджет за голосами, пропускаючи те, що не вміщається', () => {
    const cycle = testCycle({ smallBudget: 100_000, smallMaxCost: 60_000, minVotes: 1 });
    const projects = [project(1, 60_000), project(2, 50_000), project(3, 40_000)];
    const all = [...votes(1, 10), ...votes(2, 8), ...votes(3, 5)];

    const outcomes = tally(cycle, projects, all, IN_RESULTS);

    // 1 вміщається, 2 вже ні (60 + 50 > 100), 3 вміщається в залишок 40
    assert.deepEqual(funded(outcomes), new Set([1, 3]));
    assert.deepEqual(
      outcomes.map((o) => o.rank),
      [1, 2, 3],
    );
  });

  test('проєкти з голосами нижче порогу не фінансуються', () => {
    const outcomes = tally(
      testCycle({ minVotes: 3 }),
      [project(1, 10_000)],
      votes(1, 2),
      IN_RESULTS,
    );

    assert.deepEqual(funded(outcomes), new Set());
    assert.equal(outcomes[0]?.votes, 2);
  });

  test('за рівності голосів вище раніше поданий', () => {
    const cycle = testCycle({ smallBudget: 60_000, minVotes: 1 });
    const late = project(1, 60_000, { minutes: 5 });
    const early = project(2, 60_000, { minutes: 1 });

    const outcomes = tally(
      cycle,
      [late, early],
      [...votes(1, 4), ...votes(2, 4)],
      IN_RESULTS,
    );

    assert.deepEqual(funded(outcomes), new Set([2]));
  });

  test('результат отримують лише схвалені проєкти', () => {
    const rejected = project(2, 10_000, { status: ProjectStatus.REJECTED });

    const outcomes = tally(
      testCycle({ minVotes: 0 }),
      [project(1, 10_000), rejected],
      [],
      IN_RESULTS,
    );

    assert.deepEqual(
      outcomes.map((o) => o.projectId),
      [1],
    );
  });

  test('повторний підрахунок дає той самий результат', () => {
    const cycle = testCycle({ minVotes: 1 });
    const projects = [project(1, 30_000), project(2, 30_000)];
    const all = [...votes(1, 3), ...votes(2, 3)];

    assert.deepEqual(
      tally(cycle, projects, all, IN_RESULTS),
      tally(cycle, projects, all, IN_RESULTS),
    );
  });

  test('до кінця голосування підрахунок заборонений', () => {
    assert.throws(() => tally(testCycle(), [], [], IN_VOTING), TallyError);
  });
});
