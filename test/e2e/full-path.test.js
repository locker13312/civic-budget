// E2E (AC-3.4): окремий процес `node src/server.js` на PostgreSQL, HTTP ззовні.
// Раунд створюється з фазами по 1–2 секунди, тест чекає справжній час:
// у коді застосунку немає тестових «гачків» для годинника.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createTestDatabase } from '../support/pg.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const database = await createTestDatabase();

/** @returns {Promise<number>} */
const freePort = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
      server.close(() => resolve(port));
    });
  });

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<void>}
 */
const run = (args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: 'ignore' });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${args} → ${code}`)),
    );
  });

describe('[AC-3.4] E2E: повний шлях від раунду до звіту', { skip: !database }, () => {
  /** @type {import('node:child_process').ChildProcess} */
  let server;
  let base = '';

  before(async () => {
    const db = /** @type {NonNullable<typeof database>} */ (database);
    const port = await freePort();
    const env = { ...process.env, CIVIC_DATABASE_URL: db.url, PORT: String(port) };
    // користувачів через API не створюють: беремо статичних із db:seed
    await run(['scripts/db.js', 'seed'], env);
    server = spawn(process.execPath, ['src/server.js'], {
      cwd: ROOT,
      env,
      stdio: 'ignore',
    });
    base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i += 1) {
      const ready = await fetch(`${base}/ready`).catch(() => null);
      if (ready?.ok) {
        return;
      }
      await sleep(100);
    }
    throw new Error('сервер не став готовим за 10 с');
  });

  after(async () => {
    server?.kill();
    await database?.drop();
  });

  /**
   * @param {'GET' | 'POST'} method
   * @param {string} path
   * @param {{ user?: number, body?: unknown }} [options]
   * @returns {Promise<{ status: number, body: import('../api/scenarios.js').Json }>}
   */
  const http = async (method, path, { user, body } = {}) => {
    /** @type {Record<string, string>} */
    const headers = {};
    if (user) {
      headers['x-user-id'] = String(user);
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  /** @param {number} at мілісекунди epoch, до яких треба дочекатися */
  const waitUntil = async (at) => {
    await sleep(Math.max(0, at - Date.now()) + 100);
  };

  test('адміністратор → мешканці → модератор → голоси → підсумки → звіт', async () => {
    const ADMIN = 1;
    const MODERATOR = 2;
    const [IRYNA, PETRO, OKSANA, TARAS] = [3, 4, 5, 6];
    const start = Date.now();
    const phase = {
      submissionFrom: start - 1000,
      submissionTo: start + 2000,
      votingFrom: start + 3000,
      votingTo: start + 5000,
    };

    // 1. раунд: бюджет 1000 грн, вміщається лише один із двох схвалених проєктів
    const cycle = await http('POST', '/cycles', {
      user: ADMIN,
      body: {
        title: 'E2E-раунд',
        ...Object.fromEntries(
          Object.entries(phase).map(([k, v]) => [k, new Date(v).toISOString()]),
        ),
        maxVotes: 2,
        minVotes: 1,
        limits: [{ category: 'small', budget: 100_000, maxCost: 60_000 }],
      },
    });
    assert.equal(cycle.status, 201);
    assert.equal(cycle.body.phase, 'submission');
    const cycleId = cycle.body.id;

    // 2. мешканці подають заявки
    /**
     * @param {number} user
     * @param {string} title
     * @param {number} cost
     */
    const submit = (user, title, cost) =>
      http('POST', `/cycles/${cycleId}/projects`, {
        user,
        body: { category: 'small', title, cost },
      });
    const lamps = await submit(IRYNA, 'Ліхтарі', 60_000);
    const benches = await submit(PETRO, 'Лавки', 50_000);
    const graffiti = await submit(OKSANA, 'Графіті на паркані', 10_000);
    assert.deepEqual([lamps.status, benches.status, graffiti.status], [201, 201, 201]);

    // 3. модерація після кінця подання
    await waitUntil(phase.submissionTo);
    assert.equal((await http('GET', `/cycles/${cycleId}`)).body.phase, 'review');
    /**
     * @param {number} id
     * @param {object} body
     */
    const review = (id, body) =>
      http('POST', `/projects/${id}/review`, { user: MODERATOR, body });
    assert.equal((await review(lamps.body.id, { decision: 'approve' })).status, 201);
    assert.equal((await review(benches.body.id, { decision: 'approve' })).status, 201);
    const rejected = await review(graffiti.body.id, {
      decision: 'reject',
      reason: 'не за адресою',
    });
    assert.equal(rejected.status, 201);
    assert.equal(
      (await http('GET', `/projects/${graffiti.body.id}`)).body.project.status,
      'rejected',
    );

    // 4. голосування
    await waitUntil(phase.votingFrom);
    /**
     * @param {number} user
     * @param {number} id
     */
    const vote = (user, id) => http('POST', `/projects/${id}/votes`, { user });
    const votes = [
      await vote(IRYNA, lamps.body.id),
      await vote(PETRO, lamps.body.id),
      await vote(TARAS, lamps.body.id),
      await vote(TARAS, benches.body.id),
    ];
    assert.deepEqual(
      votes.map((v) => v.status),
      [201, 201, 201, 201],
    );
    assert.equal((await vote(OKSANA, graffiti.body.id)).status, 422, 'відхилений проєкт');
    const counted = await http('GET', `/cycles/${cycleId}/projects`);
    assert.deepEqual(
      counted.body.map((/** @type {{ title: string, votes: number }} */ p) => [
        p.title,
        p.votes,
      ]),
      [
        ['Ліхтарі', 3],
        ['Лавки', 1],
        ['Графіті на паркані', 0],
      ],
    );

    // 5. підсумки після кінця голосування
    await waitUntil(phase.votingTo);
    const tally = await http('POST', `/cycles/${cycleId}/tally`, { user: ADMIN });
    assert.equal(tally.status, 200);
    const results = await http('GET', `/cycles/${cycleId}/results`);
    assert.deepEqual(
      results.body.map((/** @type {{ title: string, funded: boolean }} */ r) => [
        r.title,
        r.funded,
      ]),
      [
        ['Ліхтарі', true],
        ['Лавки', false],
      ],
    );

    // 6. звіт про реалізацію переможця
    const report = await http('POST', `/projects/${lamps.body.id}/progress`, {
      user: ADMIN,
      body: { spent: 30_000, note: 'встановлено 4 ліхтарі' },
    });
    const tooMuch = await http('POST', `/projects/${lamps.body.id}/progress`, {
      user: ADMIN,
      body: { spent: 30_001 },
    });
    const progress = await http('GET', `/projects/${lamps.body.id}/progress`);
    assert.equal(report.status, 201);
    assert.equal(tooMuch.status, 422);
    assert.deepEqual(
      progress.body.map((/** @type {{ spent: number }} */ r) => r.spent),
      [30_000],
    );
  });
});
