// npm run db:migrate | db:seed | db:reset — схема і статичні дані в PostgreSQL;
// reset видаляє всі дані бази розробки і записує статичні дані заново
import { seedIfEmpty } from '../src/container.js';
import { buildIndexes, connectDb, migrate } from '../src/platform/db/index.js';
import { createLogger, loadSettings } from '../src/platform/index.js';

const command = process.argv[2];
const logger = createLogger();
const db = await connectDb({ url: loadSettings().databaseUrl, logger, max: 2 });

try {
  if (command === 'reset') {
    await db.sql.unsafe('drop schema public cascade; create schema public');
    logger.warn('базу розробки очищено');
  }
  // ті самі кроки, що на старті сервера; індекси тут чекаємо до кінця
  await migrate(db, logger, 'schema');
  await migrate(db, logger, 'data');
  await buildIndexes(db, logger);
  if (command === 'seed' || command === 'reset') {
    await seedIfEmpty(db, logger);
  } else if (command !== 'migrate') {
    throw new Error(`невідома команда ${command}; очікую migrate, seed або reset`);
  }
} finally {
  await db.close();
}
