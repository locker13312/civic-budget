import { makeCategoryLimit, makeCycle } from './domain.js';

// раунди і ліміти категорій у PostgreSQL; таблиці пише лише cycles (R3)

/**
 * @param {import('postgres').Row} row
 * @param {ReadonlyArray<import('postgres').Row>} limitRows
 * @returns {import('./domain.js').Cycle}
 */
const toCycle = (row, limitRows) =>
  makeCycle({
    id: row.id,
    title: row.title,
    submissionFrom: row.submission_from,
    submissionTo: row.submission_to,
    votingFrom: row.voting_from,
    votingTo: row.voting_to,
    maxVotes: row.max_votes,
    minVotes: row.min_votes,
    limits: limitRows.map((l) => makeCategoryLimit(l.category, l.budget, l.max_cost)),
  });

/**
 * @param {{ db: import('../platform/db/index.js').Db }} deps
 * @returns {import('./service.js').CyclesRepository}
 */
export function createPgCyclesRepository({ db }) {
  const { sql } = db;

  /**
   * @param {ReadonlyArray<import('postgres').Row>} rows
   * @returns {Promise<import('./domain.js').Cycle[]>}
   */
  const withLimits = async (rows) => {
    if (rows.length === 0) {
      return [];
    }
    const limits = await sql`
      select cycle_id, category, budget, max_cost from category_limits
      where cycle_id = any(${rows.map((r) => r.id)}::int[])
      order by cycle_id, category desc
    `;
    return rows.map((row) =>
      toCycle(
        row,
        limits.filter((l) => l.cycle_id === row.id),
      ),
    );
  };

  return {
    async insert(draft) {
      return db.tx(async (tx) => {
        const [row] = await tx`
          insert into cycles (title, submission_from, submission_to, voting_from, voting_to,
                              max_votes, min_votes)
          values (${draft.title}, ${draft.submissionFrom}, ${draft.submissionTo},
                  ${draft.votingFrom}, ${draft.votingTo}, ${draft.maxVotes}, ${draft.minVotes})
          returning *
        `;
        const cycle = /** @type {import('postgres').Row} */ (row);
        const limitRows = draft.limits.map((l) => ({
          cycle_id: cycle.id,
          category: l.category,
          budget: l.budget,
          max_cost: l.maxCost,
        }));
        await tx`insert into category_limits ${tx(limitRows)}`;
        return toCycle(cycle, limitRows);
      });
    },
    async findById(id) {
      const rows = await sql`select * from cycles where id = ${id}`;
      const [cycle] = await withLimits(rows);
      return cycle ?? null;
    },
    async list() {
      return withLimits(await sql`select * from cycles order by id`);
    },
  };
}
