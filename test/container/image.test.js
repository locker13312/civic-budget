// образ з Dockerfile (AC-4.4): контейнер сам мігрує порожню базу на старті,
// стає готовим і показує sha, з яким його зібрано. Запускається через
// `npm run test:container` (у CI — задача build), бо потрібен Docker і образ
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { after, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import postgres from 'postgres';

import { createTestDatabase } from '../support/pg.js';

const image = process.env.CIVIC_IMAGE;
const database = image ? await createTestDatabase({ empty: true }) : null;
const skip = !image
  ? 'CIVIC_IMAGE не задано: запускайте npm run test:container'
  : !database && 'PostgreSQL недоступний';

/** @param {string[]} args */
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();

describe('[AC-4.4] контейнер з образу', { skip }, () => {
  const port = String(30_000 + Math.floor(Math.random() * 10_000));
  const base = `http://127.0.0.1:${port}`;
  /** @type {string} */
  let id = '';

  after(async () => {
    if (id) {
      spawnSync('docker', ['rm', '-f', id]);
    }
    await database?.drop();
  });

  test('мігрує порожню базу на старті, /ready = 200, /version = sha образу', async () => {
    const db = /** @type {NonNullable<typeof database>} */ (database);
    // --network host: контейнер бачить PostgreSQL раннера на 127.0.0.1
    id = docker([
      'run',
      '-d',
      '--network',
      'host',
      '-e',
      `CIVIC_DATABASE_URL=${db.url}`,
      '-e',
      `PORT=${port}`,
      '-e',
      'SEED=1',
      /** @type {string} */ (image),
    ]);

    let ready = 0;
    for (let i = 0; i < 100 && ready !== 200; i += 1) {
      ready = (await fetch(`${base}/ready`).catch(() => null))?.status ?? 0;
      if (ready !== 200) {
        await sleep(200);
      }
    }
    const version = await (await fetch(`${base}/version`)).json();
    const cycles = await (await fetch(`${base}/cycles`)).json();
    const sql = postgres(db.url, { max: 1, onnotice: () => {} });
    const versions = (
      await sql`select version from schema_migrations order by version`
    ).map((r) => r.version);
    await sql.end();

    assert.equal(ready, 200, docker(['logs', id]));
    assert.equal(version.sha, process.env.GIT_SHA?.slice(0, 12));
    assert.ok(cycles.length > 0, 'SEED=1 записав статичні дані');
    assert.ok(versions.includes('schema/0001') && versions.includes('data/0001'));
  });

  test('кроки старту йдуть у порядку: схема → дані → seed → порт → індекси', async () => {
    let logs = '';
    for (let i = 0; i < 50 && !logs.includes('індекс побудовано'); i += 1) {
      logs = docker(['logs', id]);
      await sleep(200);
    }
    const at = (/** @type {string} */ text) => {
      const index = logs.indexOf(text);
      assert.ok(index >= 0, `у логах немає «${text}»:\n${logs}`);
      return index;
    };

    const order = [
      at('schema/0001_init.sql'),
      at('data/0001_trim_titles.sql'),
      at('статичні дані записано'),
      at('Server listening'),
      at('індекс побудовано'),
    ];

    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
  });

  test('docker stop (SIGTERM): процес завершується сам, з кодом 0', () => {
    docker(['stop', '--time', '20', id]);

    assert.equal(docker(['inspect', '--format', '{{.State.ExitCode}}', id]), '0');
  });
});
