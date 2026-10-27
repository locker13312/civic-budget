// скільки SQL-запитів робить один GET списку залежно від кількості елементів
// запуск: node tasks/02-prototype-db/reports/probes/n-plus-one.js
import { call } from '../../../../test/api/scenarios.js';
import { captureLogs, pgApp } from '../../../../test/support/app.js';

const { logger, lines } = captureLogs();
const env = await pgApp({ logger });
if (!env) {
  throw new Error('потрібен PostgreSQL (див. README: npm run db:up)');
}
const { app, data, db } = env;

const queries = async (url, bpId) => {
  lines.length = 0;
  await call(app, 'GET', url, { headers: { 'x-request-id': bpId } });
  return lines.filter(
    (l) => l.bpId === bpId && l.msg === 'sql' && !String(l.sql).includes('pg_catalog'),
  ).length;
};
const projectsUrl = `/cycles/${data.cycles.voting.id}/projects`;
const resultsUrl = `/cycles/${data.cycles.finished.id}/results`;
await call(app, 'POST', `/cycles/${data.cycles.finished.id}/tally`, { user: data.users.admin });
// перший запит пулу ще й читає типи з pg_catalog; міряємо з другого
await queries(projectsUrl, 'warm-up');
await queries(resultsUrl, 'warm-up-2');

const report = [];
report.push(`GET ${projectsUrl}, 7 заявок: ${await queries(projectsUrl, 'p7')} запитів`);
report.push(`GET ${resultsUrl}, 4 підсумки: ${await queries(resultsUrl, 'r4')} запитів`);
for (let i = 0; i < 10; i += 1) {
  const author = Object.values(data.users)[2 + (i % 5)];
  await db.sql`
    insert into projects (cycle_id, author_id, category, title, cost, status, submitted_at)
    values (${data.cycles.voting.id}, ${author.id}, 'small', ${`додаткова ${i}`}, 100, 'approved', now())
  `;
}
report.push(`GET ${projectsUrl}, 17 заявок: ${await queries(projectsUrl, 'p17')} запитів`);
console.log(report.join('\n'));
await env.close();
