// що робить API, коли таблицю заблокувала інша транзакція
// запуск: node tasks/02-prototype-db/reports/probes/locked-table.js
import postgres from 'postgres';

import { call } from '../../../../test/api/scenarios.js';
import { pgApp } from '../../../../test/support/app.js';

const env = await pgApp();
if (!env) {
  throw new Error('потрібен PostgreSQL (див. README: npm run db:up)');
}
const locker = postgres(env.database.url, { max: 1, onnotice: () => {} });
const session = await locker.reserve();
await session`begin`;
await session`lock table projects in access exclusive mode`;

const started = Date.now();
const outcome = await Promise.race([
  call(env.app, 'GET', `/cycles/${env.data.cycles.voting.id}/projects`).then(
    (r) => `статус ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`,
  ),
  new Promise((resolve) => setTimeout(() => resolve('відповіді немає'), 15_000)),
]);
console.log(`таблиця projects заблокована: ${outcome} через ${Date.now() - started} мс`);

await session`rollback`;
session.release();
await locker.end();
await env.close();
process.exit(0);
