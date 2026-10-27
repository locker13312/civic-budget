// той самий запит на обох сховищах: назва раунду з самих пробілів
// запуск: node tasks/02-prototype-db/reports/probes/blank-title.js
import { call } from '../../../../test/api/scenarios.js';
import { memoryApp, pgApp } from '../../../../test/support/app.js';

const day = 24 * 60 * 60 * 1000;
const at = (days) => new Date(Date.now() + days * day).toISOString();
const body = {
  title: '   ',
  submissionFrom: at(1),
  submissionTo: at(2),
  votingFrom: at(3),
  votingTo: at(4),
  maxVotes: 1,
  minVotes: 0,
  limits: [{ category: 'small', budget: 10, maxCost: 10 }],
};
for (const [name, make] of [
  ['статичні дані', memoryApp],
  ['PostgreSQL', pgApp],
]) {
  const env = await make();
  const r = await call(env.app, 'POST', '/cycles', { user: env.data.users.admin, body });
  console.log(`${name}: ${r.status} ${r.body.error ?? ''} title=${JSON.stringify(r.body.title)}`);
  await env.close();
}
