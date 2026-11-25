// E2E негативні сценарії (AC-3.10): той самий процес сервера на PostgreSQL,
// що й у повному шляху, але кожен запит має закінчитися помилкою. Сервер
// ходить до БД через TCP-проксі, щоб «вимкнути» БД посеред роботи
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ADMIN_URL, createTestDatabase } from '../support/pg.js';
import { startProxy } from '../support/proxy.js';
import { startServer } from '../support/server.js';

const database = await createTestDatabase();

// статичні дані з db:seed (src/seed.js)
const ADMIN = 1;
const RESIDENT = 3;
const VOTER = 9;
const REVIEW_CYCLE = 2;
const VOTING_CYCLE = 3;
const SUBMITTED_PROJECT = 2;
const VOTING_PROJECT = 5;

/**
 * Помилка через HTTP: статус, код `error` і той самий bpId у тілі й заголовку,
 * що й переданий `X-Request-Id`.
 *
 * @param {import('../support/server.js').HttpResponse} response
 * @param {number} status
 * @param {string} code
 * @param {string} requestId
 */
function assertError(response, status, code, requestId) {
  assert.deepEqual(
    {
      status: response.status,
      error: response.body.error,
      bpId: response.body.bpId,
      header: response.headers.get('x-request-id'),
    },
    { status, error: code, bpId: requestId, header: requestId },
  );
}

describe('[AC-3.10] E2E: негативні сценарії', { skip: !database }, () => {
  /** @type {Awaited<ReturnType<typeof startServer>>} */
  let server;
  /** @type {Awaited<ReturnType<typeof startServer>>['http']} */
  let http;
  /** @type {Awaited<ReturnType<typeof startProxy>>} */
  let proxy;

  before(async () => {
    const db = /** @type {NonNullable<typeof database>} */ (database);
    proxy = await startProxy(Number(new URL(ADMIN_URL).port));
    const throughProxy = new URL(db.url);
    throughProxy.port = String(proxy.port());
    server = await startServer({ seedUrl: db.url, serverUrl: throughProxy.toString() });
    ({ http } = server);
  });

  after(async () => {
    server?.stop();
    await proxy?.stop();
    await database?.drop();
  });

  test('запит без X-User-Id → 401 unauthenticated', async () => {
    const response = await http('POST', `/projects/${VOTING_PROJECT}/votes`, {
      requestId: 'e2e-no-user',
    });

    assertError(response, 401, 'unauthenticated', 'e2e-no-user');
  });

  test('мешканець намагається модерувати → 403 forbidden', async () => {
    const response = await http('POST', `/projects/${SUBMITTED_PROJECT}/review`, {
      user: RESIDENT,
      body: { decision: 'approve' },
      requestId: 'e2e-resident-review',
    });

    assertError(response, 403, 'forbidden', 'e2e-resident-review');
  });

  test('заявка після кінця фази подання → 422 submission_rejected', async () => {
    const response = await http('POST', `/cycles/${REVIEW_CYCLE}/projects`, {
      user: RESIDENT,
      body: { category: 'small', title: 'Запізніла заявка', cost: 10_000 },
      requestId: 'e2e-late-submission',
    });

    assertError(response, 422, 'submission_rejected', 'e2e-late-submission');
  });

  test('повторний голос → 409 vote_rejected', async () => {
    const first = await http('POST', `/projects/${VOTING_PROJECT}/votes`, {
      user: VOTER,
    });
    const repeat = await http('POST', `/projects/${VOTING_PROJECT}/votes`, {
      user: VOTER,
      requestId: 'e2e-repeat-vote',
    });

    assert.equal(first.status, 201);
    assertError(repeat, 409, 'vote_rejected', 'e2e-repeat-vote');
  });

  test('підсумки до кінця голосування → 422 tally_rejected', async () => {
    const response = await http('POST', `/cycles/${VOTING_CYCLE}/tally`, {
      user: ADMIN,
      requestId: 'e2e-early-tally',
    });

    assertError(response, 422, 'tally_rejected', 'e2e-early-tally');
  });

  test('БД недоступна → 503 source_unavailable; після відновлення знову 200', async () => {
    await proxy.stop();
    const down = await http('GET', '/cycles', { requestId: 'e2e-db-down' });
    const health = await http('GET', '/health');
    await proxy.start();
    const recovered = await http('GET', '/cycles');

    assertError(down, 503, 'source_unavailable', 'e2e-db-down');
    assert.equal(health.status, 200, 'процес сервера живий, хоч БД і недоступна');
    assert.equal(recovered.status, 200);
  });
});
