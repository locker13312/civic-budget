// доступ до БД: лише для точки збирання (src/container.js, src/server.js,
// scripts/db.js) і, через ін'єкцію Db, для repository.pg.js (adr/0007)
export { connectDb } from './connect.js';
export { buildIndexes, migrate } from './migrate.js';
export { countUsers } from './state.js';

/** @typedef {import('./connect.js').Db} Db */
