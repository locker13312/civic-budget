// npm run stage:check [-- <sha>] (AC-4.9): стейдж доступний з інтернету —
// /ready = 200, список раундів відповідає, /version показує задеплоєний sha.
// Адреса: STAGE_URL або .env; перший запит до Free-інстансу може йти ~хвилину
import { loadSettings } from '../src/platform/index.js';

/** @typedef {ReturnType<typeof JSON.parse>} Json розібраний JSON-відповіді */

loadSettings(); // підхоплює .env, якщо він є
const stage = process.env.STAGE_URL;
if (!stage) {
  throw new Error('задайте STAGE_URL, напр. https://civic-budget.onrender.com');
}
const expected = process.argv[2]?.slice(0, 12);

/**
 * @param {string} path
 * @returns {Promise<{ status: number, body: Json }>}
 */
async function get(path) {
  const response = await fetch(new URL(path, stage), {
    signal: AbortSignal.timeout(120_000),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const ready = await get('/ready');
const cycles = await get('/cycles');
const version = await get('/version');
const rows = [
  ['/ready', ready.status === 200, `${ready.status}`],
  [
    '/cycles',
    cycles.status === 200 && Array.isArray(cycles.body),
    `${cycles.status}, раундів: ${cycles.body?.length ?? '—'}`,
  ],
  [
    '/version',
    version.status === 200 && (!expected || version.body?.sha === expected),
    `${version.body?.version} ${version.body?.sha}${expected ? ` (очікую ${expected})` : ''}`,
  ],
];
for (const [path, ok, detail] of rows) {
  console.log(`${ok ? '✔' : '✖'} ${stage}${path}: ${detail}`);
}
if (rows.some(([, ok]) => !ok)) {
  process.exit(1);
}
