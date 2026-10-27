import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';

import { Category } from '../../src/cycles/index.js';
import { ProjectStatus } from '../../src/projects/index.js';
import {
  ProgressError,
  TallyError,
  reportProgress,
  tally,
} from '../../src/results/index.js';
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
 * @param {Record<number, number>} byProject
 * @returns {import('../../src/voting/index.js').VoteCounts}
 */
function counts(byProject) {
  return new Map(Object.entries(byProject).map(([id, n]) => [Number(id), n]));
}

/** @param {import('../../src/results/index.js').Outcome[]} outcomes */
function funded(outcomes) {
  return new Set(outcomes.filter((o) => o.funded).map((o) => o.projectId));
}

describe('[AC-1.7] підсумки', () => {
  test('переможці заповнюють бюджет за голосами, пропускаючи те, що не вміщається', () => {
    const cycle = testCycle({ smallBudget: 100_000, smallMaxCost: 60_000, minVotes: 1 });
    const projects = [project(1, 60_000), project(2, 50_000), project(3, 40_000)];
    const outcomes = tally(cycle, projects, counts({ 1: 10, 2: 8, 3: 5 }), IN_RESULTS);

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
      counts({ 1: 2 }),
      IN_RESULTS,
    );

    assert.deepEqual(funded(outcomes), new Set());
    assert.equal(outcomes[0]?.votes, 2);
  });

  test('за рівності голосів вище раніше поданий', () => {
    const cycle = testCycle({ smallBudget: 60_000, minVotes: 1 });
    const late = project(1, 60_000, { minutes: 5 });
    const early = project(2, 60_000, { minutes: 1 });

    const outcomes = tally(cycle, [late, early], counts({ 1: 4, 2: 4 }), IN_RESULTS);

    assert.deepEqual(funded(outcomes), new Set([2]));
  });

  test('результат отримують лише схвалені проєкти', () => {
    const rejected = project(2, 10_000, { status: ProjectStatus.REJECTED });

    const outcomes = tally(
      testCycle({ minVotes: 0 }),
      [project(1, 10_000), rejected],
      counts({}),
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
    const all = counts({ 1: 3, 2: 3 });

    assert.deepEqual(
      tally(cycle, projects, all, IN_RESULTS),
      tally(cycle, projects, all, IN_RESULTS),
    );
  });

  test('до кінця голосування підрахунок заборонений', () => {
    assert.throws(() => tally(testCycle(), [], counts({}), IN_VOTING), TallyError);
  });
});

test('[AC-1.11] results бере з voting лише кількості голосів', () => {
  const dir = new URL('../../src/results/', import.meta.url);
  const sources = readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(new URL(file, dir), 'utf8'))
    .join('\n');

  const runtime = [...sources.matchAll(/from '\.\.\/voting\/[^']+'/g)];
  const types = new Set(
    [...sources.matchAll(/import\('\.\.\/voting\/index\.js'\)\.(\w+)/g)].map((m) => m[1]),
  );

  // з Завдання 2 results отримує кількості через VotingService.countsForCycle,
  // але як і раніше не бачить окремих записів Vote
  assert.deepEqual(runtime, [], 'results не імпортує код voting напряму');
  assert.deepEqual(types, new Set(['VoteCounts', 'VotingService']));
  assert.doesNotMatch(sources, /import\('\.\.\/voting\/index\.js'\)\.Vote\b/);
});

describe('[AC-3.1] звіт про реалізацію (reportProgress)', () => {
  const stop = project(1, 400_000);
  /**
   * @param {boolean} funded
   * @returns {import('../../src/results/index.js').Outcome}
   */
  const outcome = (funded) =>
    Object.freeze({ projectId: 1, votes: 5, rank: 1, funded, decidedAt: IN_RESULTS });
  /**
   * @param {Partial<Parameters<typeof reportProgress>[0]>} overrides
   * @returns {import('../../src/results/index.js').ProgressDraft}
   */
  const report = (overrides = {}) =>
    reportProgress({
      outcome: outcome(true),
      project: stop,
      reports: [],
      spent: 100_000,
      note: '  закуплено  ',
      now: IN_RESULTS,
      ...overrides,
    });

  test('звіт переможця з обрізаною нотаткою', () => {
    assert.deepEqual(report(), {
      projectId: 1,
      spent: 100_000,
      note: 'закуплено',
      reportedAt: IN_RESULTS,
    });
  });

  test('без підсумку або для непрофінансованого проєкту — відмова', () => {
    assert.throws(() => report({ outcome: null }), ProgressError);
    assert.throws(() => report({ outcome: outcome(false) }), ProgressError);
  });

  test('сума має бути цілим додатним числом копійок', () => {
    for (const spent of [0, -5, 1.5]) {
      assert.throws(() => report({ spent }), ProgressError);
    }
  });

  test('сума звітів не перевищує вартість проєкту', () => {
    const before = [
      { id: 1, projectId: 1, spent: 350_000, note: '', reportedAt: IN_RESULTS },
    ];

    assert.throws(() => report({ reports: before, spent: 50_001 }), ProgressError);
  });
});
