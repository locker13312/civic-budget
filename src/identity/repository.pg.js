// користувачі в PostgreSQL; таблицю users пише лише identity (R3)

/**
 * @param {import('postgres').Row} row
 * @returns {import('./domain.js').User}
 */
const toUser = (row) =>
  Object.freeze({
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    verifiedAt: row.verified_at,
  });

/**
 * @param {{ db: import('../platform/db/index.js').Db }} deps
 * @returns {import('./service.js').IdentityRepository}
 */
export function createPgIdentityRepository({ db }) {
  const { sql } = db;

  return {
    async insert({ fullName, role, verifiedAt, taxIdHash }) {
      const [row] = await sql`
        insert into users (full_name, role, verified_at, tax_id_hash)
        values (${fullName}, ${role}, ${verifiedAt}, ${taxIdHash})
        returning id, full_name, role, verified_at
      `.catch(db.conflictOnUnique('користувач з таким податковим номером уже є'));
      return toUser(/** @type {import('postgres').Row} */ (row));
    },
    async findById(id) {
      const [row] = await sql`
        select id, full_name, role, verified_at from users where id = ${id}
      `;
      return row ? toUser(row) : null;
    },
    async findByIds(ids) {
      if (ids.length === 0) {
        return [];
      }
      const rows = await sql`
        select id, full_name, role, verified_at from users where id = any(${ids}::int[])
      `;
      return rows.map(toUser);
    },
  };
}
