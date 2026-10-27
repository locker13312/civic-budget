// поведінка, яку видно лише на справжній БД: транзакції, збої, логи, ізоляція
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { after, describe, test } from 'node:test';

import postgres from 'postgres';

import { connectDb } from '../../src/platform/db/index.js';
import {
  SourceUnavailableError,
  createLogger,
  loadSettings,
} from '../../src/platform/index.js';
import { call } from '../api/scenarios.js';
import { captureLogs, pgApp } from '../support/app.js';
import { ADMIN_URL, createTestDatabase } from '../support/pg.js';

const available =
  (await createTestDatabase().then(async (db) => {
    await db?.drop();
    return db !== null;
  })) || false;
const skip = available ? false : 'PostgreSQL недоступний';

/**
 * TCP-проксі між застосунком і PostgreSQL: зупинка проксі імітує падіння БД.
 *
 * @param {number} targetPort
 */
async function startProxy(targetPort) {
  /** @type {Set<net.Socket>} */
  const sockets = new Set();
  /** @type {net.Server} */
  let server;
  let port = 0;

  const listen = () =>
    new Promise((resolve) => {
      server = net.createServer((client) => {
        const upstream = net.connect(targetPort, '127.0.0.1');
        for (const socket of [client, upstream]) {
          sockets.add(socket);
          socket.on('close', () => sockets.delete(socket));
          socket.on('error', () => socket.destroy());
        }
        client.pipe(upstream).pipe(client);
      });
      server.listen(port, '127.0.0.1', () => {
        port = /** @type {net.AddressInfo} */ (server.address()).port;
        resolve(port);
      });
    });

  await listen();
  return {
    port: () => port,
    stop: () =>
      new Promise((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve(undefined));
      }),
    start: listen,
  };
}

describe('PostgreSQL: транзакції, збої, логи', { skip }, () => {
  /** @type {Array<() => Promise<void>>} */
  const cleanup = [];
  after(async () => {
    for (const fn of cleanup.reverse()) {
      await fn();
    }
  });

  test('[AC-2.8] збій посеред транзакції модерації не лишає ні статусу, ні Review', async () => {
    const env = /** @type {NonNullable<Awaited<ReturnType<typeof pgApp>>>} */ (
      await pgApp()
    );
    cleanup.push(env.close);
    const { library } = env.data.projects;
    // тригер ламає вставку Review уже після того, як статус оновлено
    await env.db.sql.unsafe(`
      create function fail_review() returns trigger language plpgsql as $$
      begin
        if new.reason = 'зламати' then raise exception 'імітований збій'; end if;
        return new;
      end $$;
      create trigger fail_review before insert on reviews
        for each row execute function fail_review();
    `);

    const response = await call(env.app, 'POST', `/projects/${library.id}/review`, {
      user: env.data.users.moderator,
      body: { decision: 'reject', reason: 'зламати' },
    });
    const [project] = await env.db
      .sql`select status from projects where id = ${library.id}`;
    const reviews = await env.db
      .sql`select 1 from reviews where project_id = ${library.id}`;

    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'internal');
    assert.equal(project?.status, 'submitted');
    assert.equal(reviews.length, 0);
  });

  test('[AC-2.2] одночасні голоси: у таблиці рівно max_votes записів', async () => {
    const { logger, lines } = captureLogs();
    const env = /** @type {NonNullable<Awaited<ReturnType<typeof pgApp>>>} */ (
      await pgApp({ logger })
    );
    cleanup.push(env.close);
    const voter = env.data.users.maria;

    const statuses = await Promise.all(
      env.data.projects.voting.slice(0, 5).map(async (p) => {
        const r = await call(env.app, 'POST', `/projects/${p.id}/votes`, { user: voter });
        return r.status;
      }),
    );
    const rows = await env.db.sql`
      select count(*)::int as n from votes
      where voter_id = ${voter.id} and cycle_id = ${env.data.cycles.voting.id}
    `;

    assert.deepEqual(statuses.sort(), [201, 201, 422, 422, 422]);
    assert.equal(rows[0]?.n, 2);
    // конфлікти SERIALIZABLE не виходять назовні: їх повторює platform/db/tx.js
    assert.equal(
      lines.filter((l) => l.msg === 'неочікувана помилка').length,
      0,
      'жодна спроба не завершилась 500',
    );
  });

  test('[AC-2.4] без БД сервер не стартує і пояснює чому', async () => {
    const started = Date.now();
    const child = spawn(process.execPath, ['src/server.js'], {
      env: {
        ...process.env,
        CIVIC_DATABASE_URL: 'postgres://civic:civic@127.0.0.1:1/none',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const code = await new Promise((resolve) => child.on('exit', resolve));

    assert.equal(code, 1);
    assert.match(output, /сервер не запущено: не вдалося підключитися до БД/);
    assert.doesNotMatch(output, /civic:civic@/, 'пароль не потрапляє в лог');
    assert.ok(Date.now() - started < 10_000, 'падає одразу, а не на першому запиті');
  });

  test('[AC-2.4] connectDb падає з SourceUnavailableError, якщо БД недоступна', async () => {
    await assert.rejects(
      connectDb({
        url: 'postgres://civic:civic@127.0.0.1:1/none',
        logger: createLogger({ level: 'silent' }),
        connectTimeout: 1,
      }),
      SourceUnavailableError,
    );
  });

  test('[AC-2.4] БД впала під час роботи: 503 і /ready 503, після відновлення працює', async () => {
    const admin = new URL(ADMIN_URL);
    const proxy = await startProxy(Number(admin.port));
    cleanup.push(proxy.stop);
    const env = /** @type {NonNullable<Awaited<ReturnType<typeof pgApp>>>} */ (
      await pgApp({ port: proxy.port() })
    );
    cleanup.push(env.close);

    const before = await call(env.app, 'GET', '/cycles');
    await proxy.stop();
    const down = await call(env.app, 'GET', '/cycles');
    const notReady = await call(env.app, 'GET', '/ready');
    const health = await call(env.app, 'GET', '/health');
    await proxy.start();
    const recovered = await call(env.app, 'GET', '/cycles');
    const ready = await call(env.app, 'GET', '/ready');

    assert.equal(before.status, 200);
    assert.equal(down.status, 503);
    assert.equal(down.body.error, 'source_unavailable');
    assert.equal(down.headers['retry-after'], '2');
    assert.equal(notReady.status, 503);
    assert.equal(health.status, 200, 'процес живий, хоч БД і недоступна');
    assert.equal(recovered.status, 200);
    assert.equal(ready.status, 200);
  });

  test('[AC-2.5] bpId і користувач у кожному рядку логу з роуту, сервісу й репозиторію', async () => {
    const { logger, lines } = captureLogs();
    const env = /** @type {NonNullable<Awaited<ReturnType<typeof pgApp>>>} */ (
      await pgApp({ logger })
    );
    cleanup.push(env.close);
    const user = env.data.users.natalia;
    lines.length = 0;

    const response = await call(
      env.app,
      'POST',
      `/cycles/${env.data.cycles.submission.id}/projects`,
      {
        user,
        body: { category: 'small', title: 'Ліхтарі в парку', cost: 1_000_000 },
        headers: { 'x-request-id': 'bp-test-1' },
      },
    );

    const mine = lines.filter((l) => l.bpId === 'bp-test-1');
    const auth = mine.findIndex((l) => l.userId === user.id);
    assert.equal(response.status, 201);
    assert.equal(lines.filter((l) => !l.bpId).length, 0, 'немає рядків без bpId');
    assert.ok(
      mine.some((l) => l.msg === 'sql'),
      'є рядок з репозиторію',
    );
    assert.ok(
      mine.some((l) => l.msg === 'заявку подано'),
      'є рядок із сервісу',
    );
    assert.ok(
      mine.some((l) => l.msg === 'запит виконано'),
      'є рядок з роуту',
    );
    // до автентифікації є лише запит пошуку самого користувача
    assert.ok(auth >= 0 && auth <= 1);
    assert.ok(mine.slice(auth).every((l) => l.userId === user.id));
  });

  test('[AC-2.11] заблокована таблиця дає 503 за обмежений час, а не очікування', async () => {
    const env = /** @type {NonNullable<Awaited<ReturnType<typeof pgApp>>>} */ (
      await pgApp()
    );
    cleanup.push(env.close);
    const locker = postgres(env.database.url, { max: 1, onnotice: () => {} });
    const session = await locker.reserve();
    await session`begin`;
    await session`lock table projects in access exclusive mode`;

    const started = Date.now();
    const response = await call(
      env.app,
      'GET',
      `/cycles/${env.data.cycles.voting.id}/projects`,
    );
    const elapsed = Date.now() - started;
    await session`rollback`;
    session.release();
    await locker.end();
    const afterUnlock = await call(
      env.app,
      'GET',
      `/cycles/${env.data.cycles.voting.id}/projects`,
    );

    assert.equal(response.status, 503);
    assert.equal(response.body.error, 'source_unavailable');
    assert.ok(elapsed < 4000, `відповідь за ${elapsed} мс`);
    assert.equal(afterUnlock.status, 200);
  });

  test('[AC-2.10] списки коштують сталу кількість запитів: 7 і 17 елементів', async () => {
    const { logger, lines } = captureLogs();
    const env = /** @type {NonNullable<Awaited<ReturnType<typeof pgApp>>>} */ (
      await pgApp({ logger })
    );
    cleanup.push(env.close);
    const { cycles, users } = env.data;
    const admin = { user: users.admin };
    /** @param {string} url */
    const queries = async (url) => {
      lines.length = 0;
      await call(env.app, 'GET', url);
      const done = lines.find((l) => l.msg === 'запит виконано');
      return /** @type {number} */ (done?.queries);
    };
    /** @param {number} cycleId */
    const addProjects = async (cycleId) => {
      const authors = [users.iryna, users.petro, users.oksana, users.taras, users.maria];
      for (let i = 0; i < 10; i += 1) {
        await env.db.sql`
          insert into projects (cycle_id, author_id, category, title, cost, status, submitted_at)
          values (${cycleId}, ${authors[i % 5]?.id ?? 0}, 'small', ${`додаткова ${i}`}, 100,
                  'approved', now() - interval '100 days')
        `;
      }
    };
    const projectsUrl = `/cycles/${cycles.voting.id}/projects`;
    const resultsUrl = `/cycles/${cycles.finished.id}/results`;
    await call(env.app, 'POST', `/cycles/${cycles.finished.id}/tally`, admin);
    await queries(projectsUrl); // прогрів пулу

    const small = {
      projects: await queries(projectsUrl),
      results: await queries(resultsUrl),
    };
    await addProjects(cycles.voting.id);
    await addProjects(cycles.finished.id);
    await call(env.app, 'POST', `/cycles/${cycles.finished.id}/tally`, admin);
    const large = {
      projects: await queries(projectsUrl),
      results: await queries(resultsUrl),
    };

    assert.ok(small.projects > 0 && small.results > 0, 'кількість запитів є в лозі');
    assert.deepEqual(large, small);
  });

  test('[AC-2.12] кожне check-обмеження схеми має перевірку в домені', async () => {
    const env = /** @type {NonNullable<Awaited<ReturnType<typeof pgApp>>>} */ (
      await pgApp()
    );
    cleanup.push(env.close);
    // нове обмеження в міграції без пари в домені ламає цей тест: спершу
    // правило в domain.js, потім рядок тут (аудит Завдання 2, п. 3)
    const domainRule = {
      'category_limits CHECK ((budget > 0))': 'cycles.makeCategoryLimit',
      "category_limits CHECK ((category = ANY (ARRAY['small'::text, 'large'::text])))":
        'cycles.makeCategoryLimit',
      'category_limits CHECK ((max_cost <= budget))': 'cycles.makeCategoryLimit',
      'category_limits CHECK ((max_cost > 0))': 'cycles.makeCategoryLimit',
      'cycles CHECK (((submission_from < submission_to) AND (submission_to < voting_from) AND (voting_from < voting_to)))':
        'cycles.makeCycle',
      'cycles CHECK ((length(TRIM(BOTH FROM title)) > 0))': 'cycles.makeCycle',
      'cycles CHECK ((max_votes >= 1))': 'cycles.makeCycle',
      'cycles CHECK ((min_votes >= 0))': 'cycles.makeCycle',
      'outcomes CHECK ((rank >= 1))': 'results.tally',
      'outcomes CHECK ((votes >= 0))': 'results.tally',
      'progress_reports CHECK ((spent > 0))': 'results.reportProgress',
      'projects CHECK ((cost > 0))': 'projects.submit',
      'projects CHECK ((length(TRIM(BOTH FROM title)) > 0))': 'projects.submit',
      "projects CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text])))":
        'projects.ProjectStatus',
      "reviews CHECK (((decision = 'approve'::text) OR (length(TRIM(BOTH FROM reason)) > 0)))":
        'projects.review',
      "reviews CHECK ((decision = ANY (ARRAY['approve'::text, 'reject'::text])))":
        'projects.Decision',
      'users CHECK ((length(TRIM(BOTH FROM full_name)) > 0))': 'identity.register',
      "users CHECK ((role = ANY (ARRAY['resident'::text, 'moderator'::text, 'admin'::text])))":
        'identity.register',
    };

    const rows = await env.db.sql`
      select c.conrelid::regclass::text || ' ' || pg_get_constraintdef(c.oid) as rule
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'c' and n.nspname = 'public' and c.conrelid <> 0
    `;

    // сортуємо в JS: порядок order by залежить від collation бази (у CI
    // en_US.utf8 ставить '>' і '<' інакше, ніж побайтовий C)
    assert.deepEqual(
      rows.map((r) => String(r.rule)).sort(),
      Object.keys(domainRule).sort(),
    );
  });

  test('[AC-2.9] кожен прогін має окрему базу, локальний PostgreSQL не на 5432–5434', async () => {
    const first =
      /** @type {NonNullable<Awaited<ReturnType<typeof createTestDatabase>>>} */ (
        await createTestDatabase()
      );
    const second =
      /** @type {NonNullable<Awaited<ReturnType<typeof createTestDatabase>>>} */ (
        await createTestDatabase()
      );
    cleanup.push(first.drop, second.drop);
    const defaults = new URL(loadSettings({}).databaseUrl);

    assert.notEqual(first.name, second.name);
    assert.match(first.name, /^civic_test_/);
    assert.equal(defaults.port, '55432');
    for (const url of [defaults, new URL(ADMIN_URL)]) {
      assert.ok(
        !['5432', '5433', '5434'].includes(url.port),
        `${url.port} зайнятий іншими`,
      );
    }
  });
});
