// голоси в PostgreSQL; таблицю votes пише лише voting (R3)

/**
 * @param {import('postgres').Row} row
 * @returns {import('./domain.js').Vote}
 */
const toVote = (row) =>
  Object.freeze({
    voterId: row.voter_id,
    projectId: row.project_id,
    cycleId: row.cycle_id,
    castAt: row.cast_at,
  });

/**
 * @param {{ db: import('../platform/db/index.js').Db }} deps
 * @returns {import('./service.js').VotingRepository}
 */
export function createPgVotingRepository({ db }) {
  const { sql } = db;

  return {
    async castVote({ voterId, cycleId }, decide) {
      // SERIALIZABLE: два одночасні голоси одного виборця не можуть обидва
      // побачити «ще є місце в ліміті»; той, що конфліктує, повториться
      // (platform/db/tx.js) і вже побачить новий голос (AC-2.2)
      return db.tx(
        async (tx) => {
          const rows = await tx`
            select * from votes where voter_id = ${voterId} and cycle_id = ${cycleId}
          `;
          const vote = decide(rows.map(toVote));
          await tx`
            insert into votes (voter_id, project_id, cycle_id, cast_at)
            values (${vote.voterId}, ${vote.projectId}, ${vote.cycleId}, ${vote.castAt})
          `.catch(db.conflictOnUnique('ви вже голосували за цей проєкт'));
          return vote;
        },
        { isolation: 'serializable' },
      );
    },

    async byVoter(voterId, cycleId) {
      const rows = await sql`
        select * from votes where voter_id = ${voterId} and cycle_id = ${cycleId}
        order by cast_at, project_id
      `;
      return rows.map(toVote);
    },

    async countsForCycle(cycleId) {
      const rows = await sql`
        select project_id, count(*)::int as votes from votes
        where cycle_id = ${cycleId}
        group by project_id
      `;
      return new Map(rows.map((r) => [r.project_id, r.votes]));
    },
  };
}
