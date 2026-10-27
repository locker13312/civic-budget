// unit-тести модуля results (AC-3.1): сервіс і репозиторій у пам'яті без
// HTTP і без БД; користувач-ініціатор — через контекст, як у запиті
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { buildContainer } from '../../src/container.js';
import { createLogger, runInContext } from '../../src/platform/index.js';
import { createMemoryResultsRepository } from '../../src/results/index.js';
import { seedStaticData } from '../../src/seed.js';

/**
 * @typedef {import('../../src/seed.js').StaticData} StaticData
 * @typedef {import('../../src/container.js').Cradle} Cradle
 */

/** @type {Cradle} */
let cradle;
/** @type {StaticData} */
let data;

beforeEach(async () => {
  cradle = buildContainer({
    storage: 'memory',
    logger: createLogger({ level: 'silent' }),
  }).cradle;
  data = await seedStaticData(cradle);
});

/**
 * @template T
 * @param {{ id: number, role: string } | null} user
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
const as = (user, fn) => runInContext({ bpId: 'unit', initiator: user }, fn);

/** @returns {{ id: number, cost: number }} */
const winner = () =>
  /** @type {{ id: number, cost: number }} */ (data.projects.finished[0]);

describe('[AC-3.1] resultsService.tally', () => {
  test('адміністратор підбиває підсумки, вони зберігаються', async () => {
    const outcomes = await as(data.users.admin, () =>
      cradle.resultsService.tally(data.cycles.finished.id),
    );
    const stored = await cradle.resultsRepository.byCycle(data.cycles.finished.id);

    assert.equal(outcomes.length, 4);
    assert.deepEqual(stored, outcomes);
  });

  test('без користувача і не адміністратором — відмова', async () => {
    await assert.rejects(
      as(null, () => cradle.resultsService.tally(data.cycles.finished.id)),
      { code: 'unauthenticated' },
    );
    await assert.rejects(
      as(data.users.moderator, () =>
        cradle.resultsService.tally(data.cycles.finished.id),
      ),
      { code: 'forbidden' },
    );
  });

  test('невідомий раунд — not_found', async () => {
    await assert.rejects(
      as(data.users.admin, () => cradle.resultsService.tally(999)),
      {
        code: 'not_found',
      },
    );
  });
});

describe('[AC-3.1] resultsService.results', () => {
  test('підсумки з назвою і категорією проєкту, у порядку місць', async () => {
    await as(data.users.admin, () =>
      cradle.resultsService.tally(data.cycles.finished.id),
    );

    const results = await cradle.resultsService.results(data.cycles.finished.id);

    assert.deepEqual(
      results.map((r) => [r.rank, r.title, r.category]),
      [
        [1, 'Зупинка з навісом', 'small'],
        [2, 'Тренажери у дворі', 'small'],
        [3, 'Клумби на набережній', 'small'],
        [4, 'Будиночок для котів', 'small'],
      ],
    );
  });

  test('підсумок без проєкту (видалено поза results) показується без назви', async () => {
    await cradle.resultsRepository.replaceOutcomes(data.cycles.finished.id, [
      { projectId: 999, votes: 0, rank: 1, funded: false, decidedAt: new Date() },
    ]);

    const [only] = await cradle.resultsService.results(data.cycles.finished.id);

    assert.equal(only?.title, '');
    assert.equal(only?.category, '');
  });

  test('до підрахунку підсумків немає', async () => {
    assert.deepEqual(await cradle.resultsService.results(data.cycles.finished.id), []);
  });
});

describe('[AC-3.1] resultsService.addProgress і progress', () => {
  beforeEach(() =>
    as(data.users.admin, () => cradle.resultsService.tally(data.cycles.finished.id)),
  );

  test('звіт для переможця зберігається, нотатка обрізається', async () => {
    const { report, replayed } = await as(data.users.admin, () =>
      cradle.resultsService.addProgress(
        winner().id,
        { spent: 1000, note: '  навіс  ' },
        null,
      ),
    );

    assert.equal(replayed, false);
    assert.equal(report.note, 'навіс');
    assert.deepEqual(await cradle.resultsService.progress(winner().id), [report]);
  });

  test('той самий Idempotency-Key повертає той самий звіт', async () => {
    const add = () =>
      as(data.users.admin, () =>
        cradle.resultsService.addProgress(winner().id, { spent: 1000, note: '' }, 'k'),
      );

    const first = await add();
    const again = await add();

    assert.equal(again.replayed, true);
    assert.equal(again.report.id, first.report.id);
    assert.equal((await cradle.resultsService.progress(winner().id)).length, 1);
  });

  test('звіт лише від адміністратора', async () => {
    await assert.rejects(
      as(data.users.iryna, () =>
        cradle.resultsService.addProgress(winner().id, { spent: 1, note: '' }, null),
      ),
      { code: 'forbidden' },
    );
  });

  test('звіт для невідомого проєкту — not_found', async () => {
    await assert.rejects(
      as(data.users.admin, () =>
        cradle.resultsService.addProgress(999, { spent: 1, note: '' }, null),
      ),
      { code: 'not_found' },
    );
    await assert.rejects(cradle.resultsService.progress(999), { code: 'not_found' });
  });
});

describe("[AC-3.1] репозиторій підсумків у пам'яті", () => {
  const at = new Date('2026-01-01T00:00:00Z');
  /**
   * @param {number} projectId
   * @param {boolean} funded
   * @returns {import('../../src/results/index.js').Outcome}
   */
  const outcome = (projectId, funded) =>
    Object.freeze({ projectId, votes: 1, rank: 1, funded, decidedAt: at });

  test('replaceOutcomes заміщує підсумки раунду, outcomeOf шукає в усіх раундах', async () => {
    const repo = createMemoryResultsRepository();
    await repo.replaceOutcomes(1, [outcome(10, true)]);
    await repo.replaceOutcomes(2, [outcome(20, false)]);
    await repo.replaceOutcomes(1, [outcome(11, true)]);

    assert.deepEqual(await repo.byCycle(1), [outcome(11, true)]);
    assert.equal(await repo.outcomeOf(10), null);
    assert.deepEqual(await repo.outcomeOf(20), outcome(20, false));
    assert.deepEqual(await repo.byCycle(3), []);
  });

  test('addProgress: той самий ключ з іншим тілом — conflict', async () => {
    const repo = createMemoryResultsRepository();
    /** @returns {import('../../src/results/index.js').ProgressDraft} */
    const draft = () => ({ projectId: 10, spent: 5, note: '', reportedAt: at });
    const intent = { projectId: 10, reporterId: 1 };

    await repo.addProgress(intent, draft, { idempotencyKey: 'k', requestHash: 'a' });

    await assert.rejects(
      repo.addProgress(intent, draft, { idempotencyKey: 'k', requestHash: 'b' }),
      { code: 'conflict' },
    );
  });

  test('addProgress передає в decide лише звіти цього проєкту', async () => {
    const repo = createMemoryResultsRepository();
    /** @type {number[]} */
    const seen = [];
    /**
     * @param {number} projectId
     * @returns {Promise<unknown>}
     */
    const add = (projectId) =>
      repo.addProgress(
        { projectId, reporterId: 1 },
        (reports) => {
          seen.push(reports.length);
          return { projectId, spent: 1, note: '', reportedAt: at };
        },
        { idempotencyKey: null, requestHash: '' },
      );

    await add(10);
    await add(20);
    await add(10);

    assert.deepEqual(seen, [0, 0, 1]);
    assert.equal((await repo.progressOf(10)).length, 2);
  });
});
