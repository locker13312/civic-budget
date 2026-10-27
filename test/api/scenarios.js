// один набір API-сценаріїв для будь-якого сховища (AC-2.1): memory.test.js
// проганяє його на статичних даних, postgres.test.js — на PostgreSQL
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

/**
 * @typedef {import('../../src/seed.js').StaticData} StaticData
 * @typedef {{ app: import('fastify').FastifyInstance, data: StaticData, close(): Promise<void> }} TestApp
 * @typedef {{ user?: { id: number }, body?: unknown, headers?: Record<string, string> }} CallOptions
 */

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {'GET' | 'POST'} method
 * @param {string} url
 * @param {CallOptions} [options]
 */
export async function call(app, method, url, { user, body, headers = {} } = {}) {
  const response = await app.inject({
    method,
    url,
    headers: { ...(user ? { 'x-user-id': String(user.id) } : {}), ...headers },
    ...(body === undefined ? {} : { payload: /** @type {object} */ (body) }),
  });
  return {
    status: response.statusCode,
    body: response.json(),
    headers: response.headers,
  };
}

/**
 * @param {string} storage
 * @param {() => Promise<TestApp | null>} makeApp null, якщо сховище недоступне
 */
export function defineScenarioSuite(storage, makeApp) {
  describe(`[AC-2.1] сценарії через API: ${storage}`, () => {
    /** @type {TestApp} */
    let current;
    /** @type {StaticData} */
    let data;
    /** @type {import('fastify').FastifyInstance} */
    let app;
    let available = true;

    before(async () => {
      const probe = await makeApp();
      available = probe !== null;
      await probe?.close();
    });

    beforeEach(async () => {
      if (!available) {
        return;
      }
      current = /** @type {TestApp} */ (await makeApp());
      ({ app, data } = current);
    });

    after(async () => {
      await current?.close();
    });

    /**
     * @param {string} name
     * @param {() => Promise<void>} fn
     */
    const it = (name, fn) =>
      test(name, async (t) => {
        if (!available) {
          t.skip(`${storage} недоступне`);
          return;
        }
        try {
          await fn();
        } finally {
          await current.close();
        }
      });

    it('раунди видно з поточною фазою', async () => {
      const { status, body } = await call(app, 'GET', '/cycles');

      assert.equal(status, 200);
      assert.deepEqual(body.map((/** @type {{ phase: string }} */ c) => c.phase).sort(), [
        'results',
        'review',
        'submission',
        'voting',
      ]);
      const one = await call(app, 'GET', `/cycles/${data.cycles.voting.id}`);
      assert.equal(one.body.phase, 'voting');
      assert.equal(one.body.limits.length, 2);
    });

    it('адміністратор створює раунд, інші ролі ні', async () => {
      const day = 24 * 60 * 60 * 1000;
      const at = (/** @type {number} */ days) =>
        new Date(Date.now() + days * day).toISOString();
      const body = {
        title: 'ГБ-2028',
        submissionFrom: at(1),
        submissionTo: at(10),
        votingFrom: at(20),
        votingTo: at(30),
        maxVotes: 3,
        minVotes: 1,
        limits: [{ category: 'small', budget: 1_000_000, maxCost: 500_000 }],
      };

      const created = await call(app, 'POST', '/cycles', {
        user: data.users.admin,
        body,
      });
      const forbidden = await call(app, 'POST', '/cycles', {
        user: data.users.iryna,
        body,
      });
      const anonymous = await call(app, 'POST', '/cycles', { body });
      const overlapping = await call(app, 'POST', '/cycles', {
        user: data.users.admin,
        body: { ...body, votingFrom: at(5) },
      });

      assert.equal(created.status, 201);
      assert.equal(created.body.phase, 'planned');
      assert.equal(forbidden.status, 403);
      assert.equal(anonymous.status, 401);
      assert.equal(overlapping.status, 422);
    });

    it('мешканець подає заявку, вона з автором у списку раунду', async () => {
      const cycleId = data.cycles.submission.id;

      const submitted = await call(app, 'POST', `/cycles/${cycleId}/projects`, {
        user: data.users.natalia,
        body: { category: 'small', title: 'Велодоріжка', cost: 5_000_000 },
      });
      const list = await call(app, 'GET', `/cycles/${cycleId}/projects`);

      assert.equal(submitted.status, 201);
      assert.equal(submitted.body.status, 'submitted');
      const mine = list.body.find(
        (/** @type {{ id: number }} */ p) => p.id === submitted.body.id,
      );
      assert.deepEqual(mine.author, {
        id: data.users.natalia.id,
        fullName: 'Наталія Савченко',
      });
      assert.equal(mine.votes, 0);
    });

    it('подання відхиляється поза фазою, понад ліміт, без верифікації і не мешканцем', async () => {
      const body = { category: 'small', title: 'Лавки', cost: 1_000_000 };
      const submission = data.cycles.submission.id;

      const late = await call(app, 'POST', `/cycles/${data.cycles.review.id}/projects`, {
        user: data.users.iryna,
        body,
      });
      const expensive = await call(app, 'POST', `/cycles/${submission}/projects`, {
        user: data.users.iryna,
        body: { ...body, cost: 400_000 * 100 + 1 },
      });
      const unverified = await call(app, 'POST', `/cycles/${submission}/projects`, {
        user: data.users.bohdan,
        body,
      });
      const moderator = await call(app, 'POST', `/cycles/${submission}/projects`, {
        user: data.users.moderator,
        body,
      });

      assert.equal(late.status, 422);
      assert.equal(expensive.status, 422);
      assert.equal(unverified.status, 422);
      assert.equal(moderator.status, 403);
    });

    it('[AC-2.3] повтор подання з тим самим Idempotency-Key не створює дубля', async () => {
      const url = `/cycles/${data.cycles.submission.id}/projects`;
      const body = { category: 'small', title: 'Ліхтарі', cost: 2_000_000 };
      const headers = { 'idempotency-key': 'k-1' };
      const before = await call(app, 'GET', url);

      const first = await call(app, 'POST', url, {
        user: data.users.petro,
        body,
        headers,
      });
      const repeat = await call(app, 'POST', url, {
        user: data.users.petro,
        body,
        headers,
      });
      const otherBody = await call(app, 'POST', url, {
        user: data.users.petro,
        body: { ...body, cost: 3_000_000 },
        headers,
      });
      const afterList = await call(app, 'GET', url);

      assert.equal(first.status, 201);
      assert.equal(repeat.status, 200);
      assert.equal(repeat.body.id, first.body.id);
      assert.equal(otherBody.status, 409);
      assert.equal(afterList.body.length, before.body.length + 1);
    });

    it('модератор ухвалює рішення; повторне рішення дає 409, відхилення без причини 422', async () => {
      const { library, stadium } = data.projects;

      const approved = await call(app, 'POST', `/projects/${library.id}/review`, {
        user: data.users.moderator,
        body: { decision: 'approve' },
      });
      const again = await call(app, 'POST', `/projects/${library.id}/review`, {
        user: data.users.moderator,
        body: { decision: 'reject', reason: 'передумав' },
      });
      const noReason = await call(app, 'POST', `/projects/${stadium.id}/review`, {
        user: data.users.moderator,
        body: { decision: 'reject' },
      });
      const byResident = await call(app, 'POST', `/projects/${stadium.id}/review`, {
        user: data.users.iryna,
        body: { decision: 'approve' },
      });
      const details = await call(app, 'GET', `/projects/${library.id}`);

      assert.equal(approved.status, 201);
      assert.equal(again.status, 409);
      assert.equal(noReason.status, 422);
      assert.equal(byResident.status, 403);
      assert.equal(details.body.project.status, 'approved');
      assert.equal(details.body.review.moderatorId, data.users.moderator.id);
    });

    it('мешканець голосує; повторний голос 409; голоси видно під час голосування', async () => {
      const [playground] = data.projects.voting;
      const target = /** @type {{ id: number }} */ (playground);
      const cycleId = data.cycles.voting.id;
      const before = await call(app, 'GET', `/cycles/${cycleId}/projects`);
      const votesOf = (
        /** @type {{ body: Array<{ id: number, votes: number }> }} */ list,
      ) => list.body.find((p) => p.id === target.id)?.votes ?? -1;

      const vote = await call(app, 'POST', `/projects/${target.id}/votes`, {
        user: data.users.natalia,
      });
      const repeat = await call(app, 'POST', `/projects/${target.id}/votes`, {
        user: data.users.natalia,
      });
      const mine = await call(app, 'GET', `/me/votes?cycleId=${cycleId}`, {
        user: data.users.natalia,
      });
      const afterList = await call(app, 'GET', `/cycles/${cycleId}/projects`);

      assert.equal(vote.status, 201);
      assert.equal(repeat.status, 409);
      assert.equal(mine.body.length, 1);
      assert.equal(votesOf(afterList), votesOf(before) + 1);
    });

    it('голос за відхилений проєкт, поза фазою або не мешканцем відхиляється', async () => {
      const rejected = /** @type {{ id: number }} */ (data.projects.voting.at(-1));

      const forRejected = await call(app, 'POST', `/projects/${rejected.id}/votes`, {
        user: data.users.natalia,
      });
      const tooEarly = await call(
        app,
        'POST',
        `/projects/${data.projects.benches.id}/votes`,
        {
          user: data.users.natalia,
        },
      );
      const byAdmin = await call(
        app,
        'POST',
        `/projects/${data.projects.bikes.id}/votes`,
        {
          user: data.users.admin,
        },
      );

      assert.equal(forRejected.status, 422);
      assert.equal(tooEarly.status, 422);
      assert.equal(byAdmin.status, 403);
    });

    it('[AC-2.2] 5 одночасних голосів при max_votes = 2 дають рівно 2', async () => {
      const approved = data.projects.voting.slice(0, 5);

      const responses = await Promise.all(
        approved.map((p) =>
          call(app, 'POST', `/projects/${p.id}/votes`, { user: data.users.maria }),
        ),
      );
      const mine = await call(app, 'GET', `/me/votes?cycleId=${data.cycles.voting.id}`, {
        user: data.users.maria,
      });

      const statuses = responses.map((r) => r.status).sort();
      assert.deepEqual(statuses, [201, 201, 422, 422, 422]);
      assert.equal(mine.body.length, 2);
    });

    it('адміністратор підбиває підсумки; повтор дає той самий результат', async () => {
      const cycleId = data.cycles.finished.id;
      const [stop, gym] = data.projects.finished;

      const first = await call(app, 'POST', `/cycles/${cycleId}/tally`, {
        user: data.users.admin,
      });
      const repeat = await call(app, 'POST', `/cycles/${cycleId}/tally`, {
        user: data.users.admin,
      });
      const results = await call(app, 'GET', `/cycles/${cycleId}/results`);
      const early = await call(app, 'POST', `/cycles/${data.cycles.voting.id}/tally`, {
        user: data.users.admin,
      });
      const byResident = await call(app, 'POST', `/cycles/${cycleId}/tally`, {
        user: data.users.iryna,
      });

      /** @param {Array<{ projectId: number, funded: boolean, votes: number, rank: number }>} list */
      const summary = (list) =>
        list.map(({ projectId, funded, votes, rank }) => ({
          projectId,
          funded,
          votes,
          rank,
        }));
      assert.equal(first.status, 200);
      assert.deepEqual(summary(repeat.body), summary(first.body));
      assert.deepEqual(
        first.body
          .filter((/** @type {{ funded: boolean }} */ o) => o.funded)
          .map((/** @type {{ projectId: number }} */ o) => o.projectId),
        [stop?.id, gym?.id],
      );
      assert.equal(results.body[0].title, 'Зупинка з навісом');
      assert.equal(early.status, 422);
      assert.equal(byResident.status, 403);
    });

    it('звіт про реалізацію: лише для переможця і не більше вартості', async () => {
      const cycleId = data.cycles.finished.id;
      const [stop, , flowers] = data.projects.finished;
      const winner = /** @type {{ id: number, cost: number }} */ (stop);
      const loser = /** @type {{ id: number }} */ (flowers);
      await call(app, 'POST', `/cycles/${cycleId}/tally`, { user: data.users.admin });
      const url = `/projects/${winner.id}/progress`;
      const headers = { 'idempotency-key': 'report-1' };

      const report = await call(app, 'POST', url, {
        user: data.users.admin,
        body: { spent: 10_000_000, note: 'закуплено навіс' },
        headers,
      });
      const replay = await call(app, 'POST', url, {
        user: data.users.admin,
        body: { spent: 10_000_000, note: 'закуплено навіс' },
        headers,
      });
      const tooMuch = await call(app, 'POST', url, {
        user: data.users.admin,
        body: { spent: winner.cost },
      });
      const forLoser = await call(app, 'POST', `/projects/${loser.id}/progress`, {
        user: data.users.admin,
        body: { spent: 1 },
      });
      const list = await call(app, 'GET', url);

      assert.equal(report.status, 201);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.id, report.body.id);
      assert.equal(tooMuch.status, 422);
      assert.equal(forLoser.status, 422);
      assert.equal(list.body.length, 1);
    });

    it('[AC-2.7] помилки мають статус і тіло { error, message, bpId }', async () => {
      const missing = await call(app, 'GET', '/projects/999999');
      const badBody = await call(
        app,
        'POST',
        `/projects/${data.projects.library.id}/review`,
        {
          user: data.users.moderator,
          body: { decision: 'maybe' },
        },
      );
      const badUser = await call(app, 'GET', '/cycles', {
        headers: { 'x-user-id': 'abc' },
      });
      const unknownUser = await call(app, 'GET', '/cycles', {
        headers: { 'x-user-id': '999999' },
      });
      const noRoute = await call(app, 'GET', '/nope');
      const traced = await call(app, 'GET', '/projects/999999', {
        headers: { 'x-request-id': 'trace-42' },
      });

      assert.equal(missing.status, 404);
      assert.equal(badBody.status, 400);
      assert.equal(badBody.body.error, 'validation_failed');
      assert.equal(badUser.status, 401);
      assert.equal(unknownUser.status, 401);
      assert.equal(noRoute.status, 404);
      for (const response of [missing, badBody, badUser, unknownUser, noRoute]) {
        assert.deepEqual(Object.keys(response.body).slice(0, 3), [
          'error',
          'message',
          'bpId',
        ]);
        assert.equal(response.body.bpId, response.headers['x-request-id']);
      }
      assert.equal(traced.body.bpId, 'trace-42');
    });
  });
}
