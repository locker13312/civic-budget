import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Category } from '../../src/cycles/index.js';
import { ProjectStatus } from '../../src/projects/index.js';
import { VoteError, castVote, countVotes } from '../../src/voting/index.js';
import { IN_REVIEW, IN_SUBMISSION, IN_VOTING, testCycle, testUser } from '../helpers.js';

const VOTER = testUser(7);

/**
 * @param {number} [id]
 * @param {{ status?: import('../../src/projects/index.js').ProjectStatus, cycleId?: number }} [options]
 * @returns {import('../../src/projects/index.js').Project}
 */
function project(id = 1, { status = ProjectStatus.APPROVED, cycleId = 1 } = {}) {
  return Object.freeze({
    id,
    cycleId,
    authorId: 1,
    category: Category.SMALL,
    title: `Проєкт ${id}`,
    cost: 10_000,
    status,
    submittedAt: IN_SUBMISSION,
  });
}

/**
 * @param {number} projectId
 * @param {number} [cycleId]
 */
function voteFor(projectId, cycleId = 1) {
  return Object.freeze({ voterId: VOTER.id, projectId, cycleId, castAt: IN_VOTING });
}

/** @param {Partial<Parameters<typeof castVote>[0]>} [overrides] */
function cast(overrides = {}) {
  return castVote({
    voter: VOTER,
    project: project(),
    cycle: testCycle(),
    voterVotes: [],
    now: IN_VOTING,
    ...overrides,
  });
}

describe('[AC-1.7] голосування', () => {
  test('голос за схвалений проєкт приймається', () => {
    assert.deepEqual(cast(), voteFor(1));
  });

  test('голос відхиляється, коли вичерпано ліміт', () => {
    assert.throws(
      () => cast({ project: project(3), voterVotes: [voteFor(1), voteFor(2)] }),
      /ліміт/,
    );
  });

  test('голоси іншого раунду не рахуються в ліміт', () => {
    const old = [voteFor(1, 99), voteFor(2, 99)];

    assert.equal(cast({ project: project(3), voterVotes: old }).projectId, 3);
  });

  test('другий голос за той самий проєкт відхиляється', () => {
    assert.throws(() => cast({ voterVotes: [voteFor(1)] }), /вже/);
  });

  for (const target of [
    project(1, { status: ProjectStatus.SUBMITTED }),
    project(1, { status: ProjectStatus.REJECTED }),
    project(1, { cycleId: 2 }),
  ]) {
    test(`не можна голосувати за ${target.status} з раунду ${target.cycleId}`, () => {
      assert.throws(() => cast({ project: target }), /не можна/);
    });
  }

  test('поза фазою голосування голос відхиляється', () => {
    assert.throws(() => cast({ now: IN_REVIEW }), /закрите/);
  });

  test('неверифікований мешканець не голосує', () => {
    assert.throws(
      () => cast({ voter: testUser(8, 'resident', { verified: false }) }),
      VoteError,
    );
  });

  test('підрахунок голосів по проєктах', () => {
    assert.deepEqual(
      countVotes([voteFor(1), voteFor(2), voteFor(1)]),
      new Map([
        [1, 2],
        [2, 1],
      ]),
    );
  });
});
