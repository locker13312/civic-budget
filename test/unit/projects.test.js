import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Category } from '../../src/cycles/index.js';
import { Role } from '../../src/identity/index.js';
import {
  Decision,
  ProjectStatus,
  ReviewError,
  SubmissionError,
  review,
  submit,
} from '../../src/projects/index.js';
import { IN_REVIEW, IN_SUBMISSION, IN_VOTING, testCycle, testUser } from '../helpers.js';

const MODERATOR = testUser(90, Role.MODERATOR);

/**
 * @param {import('../../src/cycles/index.js').Cycle} cycle
 * @param {Partial<Parameters<typeof submit>[0]>} [overrides]
 */
function submitted(cycle, overrides = {}) {
  const draft = submit({
    cycle,
    author: testUser(1),
    category: Category.SMALL,
    title: '  Лавки в сквері  ',
    cost: 50_000,
    now: IN_SUBMISSION,
    ...overrides,
  });
  return Object.freeze({ id: 1, ...draft });
}

/**
 * @param {import('../../src/projects/index.js').Project} project
 * @param {Partial<Parameters<typeof review>[1]>} [overrides]
 */
function decide(project, overrides = {}) {
  return review(project, {
    cycle: testCycle(),
    moderator: MODERATOR,
    decision: Decision.APPROVE,
    reason: '',
    now: IN_REVIEW,
    ...overrides,
  });
}

describe('[AC-1.7] подання заявки', () => {
  test('створює проєкт зі статусом submitted і обрізаною назвою', () => {
    const project = submitted(testCycle());

    assert.equal(project.status, ProjectStatus.SUBMITTED);
    assert.equal(project.title, 'Лавки в сквері');
    assert.deepEqual(project.submittedAt, IN_SUBMISSION);
  });

  test('приймає вартість, рівну максимуму категорії', () => {
    assert.equal(submitted(testCycle(), { cost: 60_000 }).cost, 60_000);
  });

  for (const cost of [0, -1, 60_001, 1.5]) {
    test(`відхиляє вартість ${cost} поза лімітом категорії`, () => {
      assert.throws(() => submitted(testCycle(), { cost }), SubmissionError);
    });
  }

  test('відхиляє неверифікованого автора', () => {
    assert.throws(
      () =>
        submitted(testCycle(), {
          author: testUser(1, Role.RESIDENT, { verified: false }),
        }),
      /верифікований/,
    );
  });

  test('відхиляє подання поза фазою подання', () => {
    assert.throws(() => submitted(testCycle(), { now: IN_REVIEW }), /закрите/);
  });
});

describe('[AC-1.7] модерація', () => {
  test('схвалення змінює статус і фіксує рішення', () => {
    const { project, review: decided } = decide(submitted(testCycle()));

    assert.equal(project.status, ProjectStatus.APPROVED);
    assert.equal(decided.moderatorId, MODERATOR.id);
    assert.equal(decided.decision, Decision.APPROVE);
  });

  test('для відхилення потрібна причина', () => {
    assert.throws(
      () => decide(submitted(testCycle()), { decision: Decision.REJECT, reason: '   ' }),
      /причина/,
    );
  });

  test('рішення ухвалює лише модератор', () => {
    assert.throws(
      () => decide(submitted(testCycle()), { moderator: testUser(5) }),
      ReviewError,
    );
  });

  test('після початку голосування модерація закрита', () => {
    assert.throws(
      () => decide(submitted(testCycle()), { now: IN_VOTING }),
      /голосування/,
    );
  });

  test('рішення не можна змінити', () => {
    const { project } = decide(submitted(testCycle()));

    assert.throws(
      () => decide(project, { decision: Decision.REJECT, reason: 'передумали' }),
      /статус/,
    );
  });
});

// кожен результат рішення модератора має свій тест (AC-3.8). Успішне
// відхилення раніше не перевірялось: мутант «рішення завжди approve»
// виживав (аудит Завдання 3, п. 2)
describe('[AC-3.8] кожен результат модерації', () => {
  test('відхилення змінює статус на rejected і зберігає обрізану причину', () => {
    const { project, review: decided } = decide(submitted(testCycle()), {
      decision: Decision.REJECT,
      reason: '  не за адресою  ',
    });

    assert.equal(project.status, ProjectStatus.REJECTED);
    assert.equal(project.status, 'rejected');
    assert.equal(decided.decision, Decision.REJECT);
    assert.equal(decided.reason, 'не за адресою');
    assert.deepEqual(decided.decidedAt, IN_REVIEW);
  });

  test('модерувати можна вже під час подання', () => {
    const { project } = decide(submitted(testCycle()), { now: IN_SUBMISSION });

    assert.equal(project.status, ProjectStatus.APPROVED);
  });

  test('кожна відмова має код review_rejected і свій вид', () => {
    const project = submitted(testCycle());
    /** @type {Array<[Partial<Parameters<typeof review>[1]>, string]>} */
    const cases = [
      [{ moderator: testUser(5) }, 'forbidden'],
      [{ cycle: testCycle({ id: 2 }) }, 'rule'],
      [{ now: IN_VOTING }, 'rule'],
      [{ decision: Decision.REJECT, reason: '' }, 'rule'],
    ];
    for (const [overrides, kind] of cases) {
      assert.throws(() => decide(project, overrides), { code: 'review_rejected', kind });
    }
    const { project: approved } = decide(project);
    assert.throws(() => decide(approved), { code: 'review_rejected', kind: 'conflict' });
  });

  test('відмова в поданні має код submission_rejected', () => {
    assert.throws(() => submitted(testCycle(), { cost: 0 }), {
      code: 'submission_rejected',
      kind: 'rule',
    });
  });
});
