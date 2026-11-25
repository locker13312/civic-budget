/**
 * Чи є в базі хоч один користувач: так seed відрізняє порожню базу від
 * уже заповненої і не дублює статичні дані.
 *
 * @param {import('./connect.js').Db} db
 * @returns {Promise<number>}
 */
export async function countUsers(db) {
  const [row] = await db.sql`select count(*)::int as users from users`;
  return row?.users ?? 0;
}
