// npm run db:migrate | db:seed | db:reset — схема і статичні дані в PostgreSQL;
// reset видаляє всі дані бази розробки і записує статичні дані заново
import { buildContainer } from '../src/container.js';
import { connectDb, migrate } from '../src/platform/db/index.js';
import { createLogger, loadSettings } from '../src/platform/index.js';
import { seedStaticData } from '../src/seed.js';

const command = process.argv[2];
const logger = createLogger();
const db = await connectDb({ url: loadSettings().databaseUrl, logger, max: 2 });

try {
  if (command === 'reset') {
    await db.sql.unsafe('drop schema public cascade; create schema public');
    logger.warn('базу розробки очищено');
  }
  await migrate(db, logger);
  if (command === 'seed' || command === 'reset') {
    const [{ users } = { users: 0 }] =
      await db.sql`select count(*)::int as users from users`;
    if (users > 0) {
      logger.info({ users }, 'статичні дані вже є, пропускаю');
    } else {
      const { cycles } = await seedStaticData(
        buildContainer({ storage: 'postgres', db, logger }).cradle,
      );
      logger.info({ cycles: Object.keys(cycles).length }, 'статичні дані записано');
    }
  } else if (command !== 'migrate') {
    throw new Error(`невідома команда ${command}; очікую migrate, seed або reset`);
  }
} finally {
  await db.close();
}
