// доступ до БД: лише для точки збирання (src/container.js, src/server.js,
// scripts/db.js) і, через ін'єкцію Db, для repository.pg.js (adr/0007)
export { connectDb } from './connect.js';
export { migrate } from './migrate.js';

/** @typedef {import('./connect.js').Db} Db */
