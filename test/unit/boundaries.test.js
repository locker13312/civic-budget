// межі правил (AC-3.7): кожен поріг перевірено на самому значенні й поруч.
// Тести з'явились після мутаційного тестування: заміни `<` на `<=` у цих
// місцях виживали при зелених тестах (аудит Завдання 3, п. 1)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  Category,
  CycleError,
  Phase,
  limitFor,
  makeCategoryLimit,
  makeCycle,
  phaseAt,
} from '../../src/cycles/index.js';
import { ProjectStatus } from '../../src/projects/index.js';
import { ProgressError, reportProgress, tally } from '../../src/results/index.js';
import { VoteError, castVote } from '../../src/voting/index.js';
import { IN_RESULTS, IN_SUBMISSION, IN_VOTING, testCycle, testUser } from '../helpers.js';

const MS = 1;

/**
 * @param {Date} date
 * @param {number} ms
 * @returns {Date}
 */
const plus = (date, ms) => new Date(date.getTime() + ms);

describe('[AC-3.7] межі фаз раунду', () => {
  const cycle = testCycle();
  const cases = /** @type {const} */ ([
    ['submissionTo', Phase.SUBMISSION, Phase.REVIEW],
    ['votingFrom', Phase.REVIEW, Phase.VOTING],
    ['votingTo', Phase.VOTING, Phase.RESULTS],
  ]);

  for (const [edge, before, at] of cases) {
    test(`${edge}: за 1 мс до межі ще ${before}, на межі вже ${at}`, () => {
      assert.equal(phaseAt(cycle, plus(cycle[edge], -MS)), before);
      assert.equal(phaseAt(cycle, cycle[edge]), at);
    });
  }
});

describe('[AC-3.7] межі правил раунду', () => {
  const cycle = testCycle();
  /**
   * @param {Partial<import('../../src/cycles/index.js').Cycle>} overrides
   * @returns {import('../../src/cycles/index.js').Cycle}
   */
  const make = (overrides) =>
    makeCycle({
      ...cycle,
      ...overrides,
      limits: [...(overrides.limits ?? cycle.limits)],
    });

  test('max_votes: 1 можна, 0 ні', () => {
    assert.equal(make({ maxVotes: 1 }).maxVotes, 1);
    assert.throws(() => make({ maxVotes: 0 }), { code: 'invalid_cycle' });
  });

  test('min_votes: 0 можна, -1 ні', () => {
    assert.equal(make({ minVotes: 0 }).minVotes, 0);
    assert.throws(() => make({ minVotes: -1 }), { code: 'invalid_cycle' });
  });

  test('сусідні фази не можуть збігатися в часі', () => {
    assert.throws(() => make({ votingFrom: cycle.submissionTo }), {
      code: 'invalid_cycle',
    });
    assert.equal(make({ votingFrom: plus(cycle.submissionTo, MS) }).id, cycle.id);
  });

  test('ліміт для однієї категорії двічі — помилка', () => {
    const small = makeCategoryLimit(Category.SMALL, 10, 10);
    assert.throws(() => make({ limits: [small, small] }), { code: 'invalid_cycle' });
  });

  test('бюджет і максимальна вартість: 1 можна, 0 ні; max_cost = budget можна', () => {
    assert.equal(makeCategoryLimit(Category.SMALL, 1, 1).maxCost, 1);
    assert.throws(() => makeCategoryLimit(Category.SMALL, 0, 1), {
      code: 'invalid_cycle',
    });
    assert.throws(() => makeCategoryLimit(Category.SMALL, 1, 0), {
      code: 'invalid_cycle',
    });
  });

  test('категорії без ліміту в раунді немає', () => {
    const onlySmall = make({ limits: [makeCategoryLimit(Category.SMALL, 10, 10)] });
    assert.throws(() => limitFor(onlySmall, Category.LARGE), { code: 'invalid_cycle' });
    assert.equal(limitFor(onlySmall, Category.SMALL).budget, 10);
  });

  test('назва раунду обрізається лише в сервісі; домен відхиляє порожню', () => {
    assert.throws(() => make({ title: ' ' }), CycleError);
  });
});

describe('[AC-3.7] межі підсумків', () => {
  /**
   * @param {number} id
   * @param {number} cost
   * @param {{ cycleId?: number, minutes?: number }} [options]
   * @returns {import('../../src/projects/index.js').Project}
   */
  const project = (id, cost, { cycleId = 1, minutes = 0 } = {}) =>
    Object.freeze({
      id,
      cycleId,
      authorId: 1,
      category: Category.SMALL,
      title: `П${id}`,
      cost,
      status: ProjectStatus.APPROVED,
      submittedAt: plus(IN_SUBMISSION, minutes * 60_000),
    });
  /**
   * @param {Array<[number, number]>} pairs
   * @returns {Map<number, number>}
   */
  const counts = (pairs) => new Map(pairs);
  /**
   * @param {import('../../src/results/index.js').Outcome[]} outcomes
   * @returns {number[]}
   */
  const funded = (outcomes) => outcomes.filter((o) => o.funded).map((o) => o.projectId);

  test('рівно min_votes голосів — фінансується, на один менше — ні', () => {
    const cycle = testCycle({ minVotes: 3 });

    const outcomes = tally(
      cycle,
      [project(1, 10), project(2, 10)],
      counts([
        [1, 3],
        [2, 2],
      ]),
      IN_RESULTS,
    );

    assert.deepEqual(funded(outcomes), [1]);
  });

  test('проєкт вартістю рівно в залишок бюджету фінансується', () => {
    const cycle = testCycle({ smallBudget: 100, smallMaxCost: 100, minVotes: 0 });

    const outcomes = tally(
      cycle,
      [project(1, 60), project(2, 40), project(3, 1)],
      counts([
        [1, 3],
        [2, 2],
        [3, 1],
      ]),
      IN_RESULTS,
    );

    assert.deepEqual(funded(outcomes), [1, 2]);
  });

  test('проєкти іншого раунду в підсумки не потрапляють', () => {
    const cycle = testCycle({ minVotes: 0 });

    const outcomes = tally(
      cycle,
      [project(1, 10), project(2, 10, { cycleId: 2 })],
      counts([]),
      IN_RESULTS,
    );

    assert.deepEqual(
      outcomes.map((o) => o.projectId),
      [1],
    );
  });

  test('рівні голоси й час подання: вище менший id', () => {
    const cycle = testCycle({ smallBudget: 10, smallMaxCost: 10, minVotes: 0 });

    const outcomes = tally(
      cycle,
      [project(7, 10), project(3, 10)],
      counts([
        [7, 1],
        [3, 1],
      ]),
      IN_RESULTS,
    );

    assert.deepEqual(funded(outcomes), [3]);
  });
});

describe('[AC-3.7] межі звіту про реалізацію', () => {
  const project = Object.freeze({
    id: 1,
    cycleId: 1,
    authorId: 1,
    category: Category.SMALL,
    title: 'П',
    cost: 1000,
    status: ProjectStatus.APPROVED,
    submittedAt: IN_SUBMISSION,
  });
  const outcome = Object.freeze({
    projectId: 1,
    votes: 1,
    rank: 1,
    funded: true,
    decidedAt: IN_RESULTS,
  });
  const before = [{ id: 1, projectId: 1, spent: 600, note: '', reportedAt: IN_RESULTS }];
  /**
   * @param {number} spent
   * @returns {import('../../src/results/index.js').ProgressDraft}
   */
  const report = (spent) =>
    reportProgress({
      outcome,
      project,
      reports: before,
      spent,
      note: '',
      now: IN_RESULTS,
    });

  test('витрати рівно до вартості можна, на копійку більше ні', () => {
    assert.equal(report(400).spent, 400);
    assert.throws(() => report(401), {
      code: 'progress_rejected',
      message: /1001 коп\./,
    });
  });

  test('мінімальна сума 1 копійка, 0 ні', () => {
    assert.equal(report(1).spent, 1);
    assert.throws(() => report(0), ProgressError);
  });
});

describe('[AC-3.7] межа ліміту голосів', () => {
  test('max_votes - 1 голос ще можна, max_votes уже ні', () => {
    const cycle = testCycle({ maxVotes: 2 });
    const voter = testUser(7);
    /**
     * @param {number} id
     * @returns {import('../../src/projects/index.js').Project}
     */
    const target = (id) =>
      Object.freeze({
        id,
        cycleId: 1,
        authorId: 1,
        category: Category.SMALL,
        title: 'П',
        cost: 1,
        status: ProjectStatus.APPROVED,
        submittedAt: IN_SUBMISSION,
      });
    /**
     * @param {number} id
     * @returns {import('../../src/voting/index.js').Vote}
     */
    const vote = (id) =>
      Object.freeze({ voterId: 7, projectId: id, cycleId: 1, castAt: IN_VOTING });

    assert.equal(
      castVote({
        voter,
        project: target(2),
        cycle,
        voterVotes: [vote(1)],
        now: IN_VOTING,
      }).projectId,
      2,
    );
    assert.throws(
      () =>
        castVote({
          voter,
          project: target(3),
          cycle,
          voterVotes: [vote(1), vote(2)],
          now: IN_VOTING,
        }),
      (error) =>
        error instanceof VoteError &&
        error.code === 'vote_rejected' &&
        error.kind === 'rule',
    );
  });
});
