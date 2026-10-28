// запуск `node src/server.js` окремим процесом для E2E (AC-3.4, AC-3.10)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

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

/**
 * @typedef {{ status: number, body: import('../api/scenarios.js').Json,
 *   headers: Headers }} HttpResponse
 * @typedef {{ user?: number, body?: unknown, requestId?: string }} HttpOptions
 */

/**
 * Засіває базу статичними даними (`db:seed`) і запускає сервер на вільному
 * порту; повертає HTTP-клієнт до нього.
 *
 * @param {{ seedUrl: string, serverUrl?: string }} urls serverUrl — інша адреса
 *   тієї самої бази для сервера (наприклад, через проксі)
 */
export async function startServer({ seedUrl, serverUrl = seedUrl }) {
  const port = await freePort();
  // користувачів через API не створюють: беремо статичних із db:seed
  await run(['scripts/db.js', 'seed'], { ...process.env, CIVIC_DATABASE_URL: seedUrl });
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, CIVIC_DATABASE_URL: serverUrl, PORT: String(port) },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;

  /**
   * @param {'GET' | 'POST'} method
   * @param {string} path
   * @param {HttpOptions} [options]
   * @returns {Promise<HttpResponse>}
   */
  const http = async (method, path, { user, body, requestId } = {}) => {
    /** @type {Record<string, string>} */
    const headers = {};
    if (user) {
      headers['x-user-id'] = String(user);
    }
    if (requestId) {
      headers['x-request-id'] = requestId;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  };

  for (let i = 0; i < 100; i += 1) {
    const ready = await fetch(`${base}/ready`).catch(() => null);
    if (ready?.ok) {
      return { http, stop: () => server.kill() };
    }
    await sleep(100);
  }
  server.kill();
  throw new Error('сервер не став готовим за 10 с');
}
