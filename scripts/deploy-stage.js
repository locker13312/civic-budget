// задача deploy у CI (AC-4.8): просить Render розгорнути образ саме цього
// коміту і чекає, поки стейдж відповість цим sha на /version. Доступу до БД
// тут немає: міграції виконає сам контейнер на старті.
//   RENDER_DEPLOY_HOOK_URL — секрет GitHub; STAGE_URL — адреса стейджу;
//   IMAGE — ghcr.io/<власник>/<репо>; SHA — повний sha коміту
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/**
 * Опитує `/version`, доки sha не збіжеться. Free-інстанс Render засинає і
 * прокидається до хвилини, а нова версія стартує не одразу, тож помилки й
 * чужий sha до дедлайну — це очікування, а не провал.
 *
 * @param {{
 *   stageUrl: string,
 *   sha: string,
 *   timeoutMs?: number,
 *   intervalMs?: number,
 *   fetch?: typeof globalThis.fetch,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   now?: () => number,
 *   log?: (line: string) => void,
 * }} options
 * @returns {Promise<{ attempts: number }>}
 */
export async function waitForVersion({
  stageUrl,
  sha,
  timeoutMs = 10 * 60_000,
  intervalMs = 10_000,
  fetch = globalThis.fetch,
  sleep: wait = sleep,
  now = Date.now,
  log = () => {},
}) {
  const expected = sha.slice(0, 12);
  const deadline = now() + timeoutMs;
  let last;
  for (let attempts = 1; ; attempts += 1) {
    try {
      const response = await fetch(new URL('/version', stageUrl), {
        signal: AbortSignal.timeout(Math.min(intervalMs * 6, 90_000)),
      });
      const body = response.ok ? await response.json() : null;
      last = body?.sha ?? `HTTP ${response.status}`;
      if (last === expected) {
        log(`стейдж віддає ${expected} (спроба ${attempts})`);
        return { attempts };
      }
    } catch (error) {
      last = /** @type {Error} */ (error).message;
    }
    log(`спроба ${attempts}: ${last}, чекаю ${expected}`);
    if (now() + intervalMs > deadline) {
      throw new Error(
        `стейдж не віддав ${expected} за ${Math.round(timeoutMs / 1000)} с; остання відповідь: ${last}`,
      );
    }
    await wait(intervalMs);
  }
}

/**
 * Deploy hook Render з `imgURL`: розгорнути саме цей тег образу.
 *
 * @param {{ hookUrl: string, image: string, fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<number>} HTTP-статус (200 — почато, 202 — у черзі)
 */
export async function triggerDeploy({ hookUrl, image, fetch = globalThis.fetch }) {
  const url = new URL(hookUrl);
  url.searchParams.set('imgURL', image);
  const response = await fetch(url, { method: 'POST' });
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`deploy hook Render відповів ${response.status}`);
  }
  return response.status;
}

async function main() {
  const { RENDER_DEPLOY_HOOK_URL, STAGE_URL, IMAGE, SHA } = process.env;
  if (!RENDER_DEPLOY_HOOK_URL || !STAGE_URL || !IMAGE || !SHA) {
    throw new Error('потрібні RENDER_DEPLOY_HOOK_URL, STAGE_URL, IMAGE і SHA');
  }
  const image = `${IMAGE}:${SHA}`;
  const status = await triggerDeploy({ hookUrl: RENDER_DEPLOY_HOOK_URL, image });
  console.log(`Render прийняв деплой ${image} (HTTP ${status})`);
  await waitForVersion({ stageUrl: STAGE_URL, sha: SHA, log: console.log });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
