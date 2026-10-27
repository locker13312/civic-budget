import { ConflictError } from '../platform/index.js';

// підсумки і звіти про реалізацію в PostgreSQL; outcomes і progress_reports
// пише лише results (R3)

/**
 * @param {import('postgres').Row} row
 * @returns {import('./domain.js').Outcome}
 */
const toOutcome = (row) =>
  Object.freeze({
    projectId: row.project_id,
    votes: row.votes,
    rank: row.rank,
    funded: row.funded,
    decidedAt: row.decided_at,
  });

/**
 * @param {import('postgres').Row} row
 * @returns {import('./domain.js').ProgressReport}
 */
const toReport = (row) =>
  Object.freeze({
    id: row.id,
    projectId: row.project_id,
    spent: row.spent,
    note: row.note,
    reportedAt: row.reported_at,
  });

const REPORT = ['id', 'project_id', 'spent', 'note', 'reported_at'];

/**
 * @param {{ db: import('../platform/db/index.js').Db }} deps
 * @returns {import('./service.js').ResultsRepository}
 */
export function createPgResultsRepository({ db }) {
  const { sql } = db;
  const report = sql(REPORT);

  return {
    async replaceOutcomes(cycleId, outcomes) {
      await db.tx(async (tx) => {
        const ids = outcomes.map((o) => o.projectId);
        await tx`
          delete from outcomes
          where cycle_id = ${cycleId} and not (project_id = any(${ids}::int[]))
        `;
        if (outcomes.length === 0) {
          return;
        }
        const rows = outcomes.map((o) => ({
          project_id: o.projectId,
          cycle_id: cycleId,
          votes: o.votes,
          rank: o.rank,
          funded: o.funded,
          decided_at: o.decidedAt,
        }));
        await tx`
          insert into outcomes ${tx(rows)}
          on conflict (project_id) do update set
            votes = excluded.votes, rank = excluded.rank,
            funded = excluded.funded, decided_at = excluded.decided_at
        `;
      });
    },

    async byCycle(cycleId) {
      const rows = await sql`
        select * from outcomes where cycle_id = ${cycleId} order by rank, project_id
      `;
      return rows.map(toOutcome);
    },

    async outcomeOf(projectId) {
      const [row] = await sql`select * from outcomes where project_id = ${projectId}`;
      return row ? toOutcome(row) : null;
    },

    async addProgress(
      { projectId, reporterId },
      decide,
      { idempotencyKey, requestHash },
    ) {
      /** @returns {Promise<{ report: import('./domain.js').ProgressReport, replayed: boolean } | null>} */
      const replay = async () => {
        if (!idempotencyKey) {
          return null;
        }
        const [existing] = await sql`
          select ${report}, request_hash from progress_reports
          where reporter_id = ${reporterId} and idempotency_key = ${idempotencyKey}
        `;
        if (!existing) {
          return null;
        }
        if (existing.request_hash !== requestHash) {
          throw new ConflictError('Idempotency-Key уже використано з іншим тілом запиту');
        }
        return { report: toReport(existing), replayed: true };
      };

      const known = await replay();
      if (known) {
        return known;
      }
      const inserted = await db.tx(
        async (tx) => {
          const rows = await tx`
            select ${report} from progress_reports where project_id = ${projectId}
          `;
          const draft = decide(rows.map(toReport));
          return tx`
            insert into progress_reports (project_id, reporter_id, spent, note, reported_at,
                                          idempotency_key, request_hash)
            values (${draft.projectId}, ${reporterId}, ${draft.spent}, ${draft.note},
                    ${draft.reportedAt}, ${idempotencyKey}, ${requestHash})
            on conflict (reporter_id, idempotency_key) do nothing
            returning ${report}
          `;
        },
        { isolation: 'serializable' },
      );
      if (inserted[0]) {
        return { report: toReport(inserted[0]), replayed: false };
      }
      // той самий ключ щойно вставив паралельний запит
      return /** @type {NonNullable<Awaited<ReturnType<typeof replay>>>} */ (
        await replay()
      );
    },

    async progressOf(projectId) {
      const rows = await sql`
        select ${report} from progress_reports where project_id = ${projectId} order by id
      `;
      return rows.map(toReport);
    },
  };
}
