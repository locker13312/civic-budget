// blue-green (AC-4.7): дві версії сервера на одній БД за балансувальником.
// Нова не отримує трафік, доки її /ready ≠ 200; стара після SIGTERM віддає
// /ready = 503, доробляє запит, що вже виконується, і виходить з кодом 0.
// Увесь час іде навантаження через балансувальник — жоден запит не падає.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import postgres from 'postgres';

import { startBalancer } from '../support/balancer.js';
import { createTestDatabase } from '../support/pg.js';
import { startServer } from '../support/server.js';

const database = await createTestDatabase();
const SHUTDOWN_DELAY_MS = '500';

describe('[AC-4.7] blue-green без втрачених запитів', { skip: !database }, () => {
  /** @type {Array<() => unknown>} */
  const cleanup = [];
  after(async () => {
    for (const fn of cleanup.reverse()) {
      await fn();
    }
    await database?.drop();
  });

  test('перемикання blue → green під навантаженням', { timeout: 60_000 }, async () => {
    const db = /** @type {NonNullable<typeof database>} */ (database);
    const env = { CIVIC_SHUTDOWN_DELAY_MS: SHUTDOWN_DELAY_MS };
    const blue = await startServer({ seedUrl: db.url, env });
    cleanup.push(() => blue.stop());
    const balancer = await startBalancer(blue.base);
    cleanup.push(() => balancer.stop());

    // навантаження: 8 паралельних клієнтів читають через балансувальник
    let running = true;
    /** @type {string[]} */
    const failures = [];
    let served = 0;
    const clients = Array.from({ length: 8 }, async (_, n) => {
      const paths = ['/cycles', '/cycles/3/projects', '/ready'];
      for (let i = n; running; i += 1) {
        const path = paths[i % paths.length];
        const response = await fetch(`${balancer.base}${path}`).catch(
          (/** @type {Error} */ error) => error,
        );
        if (response instanceof Error || response.status !== 200) {
          failures.push(
            `${path}: ${response instanceof Error ? response.message : response.status}`,
          );
        }
        served += 1;
      }
    });

    // змінні, які заповнюються в try; finally завжди зупиняє клієнтів,
    // інакше при помилці навантаження йшло б вічно
    /** @type {import('../support/server.js').HttpResponse} */
    let draining;
    /** @type {import('../support/server.js').HttpResponse} */
    let slow;
    /** @type {number | null} */
    let code;
    try {
      // green стартує на тій самій БД; трафік на нього — лише після /ready = 200
      await sleep(300);
      const green = await startServer({ seedUrl: db.url, seed: false, env });
      cleanup.push(() => green.stop());
      assert.equal((await green.http('GET', '/ready')).status, 200);
      balancer.switchTo(green.base);

      // запит, що виконується на blue в мить SIGTERM: таблицю тримає блокування
      const sql = postgres(db.url, { max: 1, onnotice: () => {} });
      cleanup.push(() => sql.end());
      const locked = sql.begin(async (tx) => {
        await tx`lock table cycles in access exclusive mode`;
        await sleep(900);
      });
      await sleep(100);
      const inFlight = blue.http('GET', '/cycles');
      await sleep(100);
      const exited = once(blue.process, 'exit');
      blue.process.kill('SIGTERM');
      await sleep(100);
      draining = await blue.http('GET', '/ready');

      await locked;
      slow = await inFlight;
      [code] = await exited;
      await sleep(300);
    } finally {
      running = false;
      await Promise.all(clients);
    }

    assert.equal(draining.status, 503, 'після SIGTERM /ready = 503');
    assert.equal(slow.status, 200, 'запит, що вже виконувався, доробляється');
    assert.equal(code, 0, 'blue виходить сам, з кодом 0');
    assert.ok(served > 50, `запитів через балансувальник: ${served}`);
    assert.deepEqual(failures, []);
  });
});
