import { ConflictError } from '../platform/index.js';

// заявки й рішення модератора в PostgreSQL; projects і reviews пише лише
// цей модуль (R3)

/**
 * @param {import('postgres').Row} row
 * @returns {import('./domain.js').Project}
 */
const toProject = (row) =>
  Object.freeze({
    id: row.id,
    cycleId: row.cycle_id,
    authorId: row.author_id,
    category: row.category,
    title: row.title,
    cost: row.cost,
    status: row.status,
    submittedAt: row.submitted_at,
  });

/**
 * @param {import('postgres').Row} row
 * @returns {import('./domain.js').Review}
 */
const toReview = (row) =>
  Object.freeze({
    projectId: row.project_id,
    moderatorId: row.moderator_id,
    decision: row.decision,
    reason: row.reason,
    decidedAt: row.decided_at,
  });

const COLUMNS = [
  'id',
  'cycle_id',
  'author_id',
  'category',
  'title',
  'cost',
  'status',
  'submitted_at',
];

/**
 * @param {{ db: import('../platform/db/index.js').Db }} deps
 * @returns {import('./service.js').ProjectsRepository}
 */
export function createPgProjectsRepository({ db }) {
  const { sql } = db;
  const columns = sql(COLUMNS);

  return {
    async insertSubmission(draft, { idempotencyKey, requestHash }) {
      // ключ повтору унікальний для автора: повтор не вставить другий рядок,
      // навіть якщо два однакові запити прийшли одночасно
      const inserted = await sql`
        insert into projects (cycle_id, author_id, category, title, cost, status, submitted_at,
                              idempotency_key, request_hash)
        values (${draft.cycleId}, ${draft.authorId}, ${draft.category}, ${draft.title},
                ${draft.cost}, ${draft.status}, ${draft.submittedAt},
                ${idempotencyKey}, ${requestHash})
        on conflict (author_id, idempotency_key) do nothing
        returning ${columns}
      `;
      if (inserted[0]) {
        return { project: toProject(inserted[0]), replayed: false };
      }
      const [existing] = await sql`
        select ${columns}, request_hash from projects
        where author_id = ${draft.authorId} and idempotency_key = ${idempotencyKey}
      `;
      if (!existing || existing.request_hash !== requestHash) {
        throw new ConflictError('Idempotency-Key уже використано з іншим тілом запиту');
      }
      return { project: toProject(existing), replayed: true };
    },

    async findById(id) {
      const [row] = await sql`select ${columns} from projects where id = ${id}`;
      return row ? toProject(row) : null;
    },

    async findByIds(ids) {
      if (ids.length === 0) {
        return [];
      }
      const rows =
        await sql`select ${columns} from projects where id = any(${ids}::int[])`;
      return rows.map(toProject);
    },

    async listByCycle(cycleId) {
      const rows = await sql`
        select ${columns} from projects where cycle_id = ${cycleId} order by id
      `;
      return rows.map(toProject);
    },

    async reviewOf(projectId) {
      const [row] = await sql`select * from reviews where project_id = ${projectId}`;
      return row ? toReview(row) : null;
    },

    async saveReview(project, review) {
      // статус і Review змінюються разом або не змінюються зовсім (AC-2.8)
      await db.tx(async (tx) => {
        const updated = await tx`
          update projects set status = ${project.status}
          where id = ${project.id} and status = 'submitted'
          returning id
        `;
        if (updated.length === 0) {
          throw new ConflictError('проєкт уже розглянуто');
        }
        await tx`
          insert into reviews (project_id, moderator_id, decision, reason, decided_at)
          values (${review.projectId}, ${review.moderatorId}, ${review.decision},
                  ${review.reason}, ${review.decidedAt})
        `.catch(db.conflictOnUnique('проєкт уже розглянуто'));
      });
    },
  };
}
