// правила шарів самі мають працювати: SQL, транзакції чи try/catch у роуті
// або сервісі ламають lint (AC-2.6)
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { ESLint } from 'eslint';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd });

/**
 * @param {string} code
 * @param {string} filePath
 * @returns {Promise<string[]>}
 */
async function restricted(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => m.message);
}

const SQL = '/** @param {any} db */\nexport const f = (db) => db.sql`select 1`;\n';
const TX = '/** @param {any} db */\nexport const f = (db) => db.tx(async () => {});\n';
const TRY =
  '/** @returns {number} */\nexport function f() {\n  try {\n    return 1;\n  } catch {\n    return 0;\n  }\n}\n';

describe('[AC-2.6] межі шарів перевіряє lint', () => {
  test('SQL у роуті й сервісі заборонено', async () => {
    assert.match((await restricted(SQL, 'src/web/routes/x.js'))[0] ?? '', /R5/);
    assert.match((await restricted(SQL, 'src/voting/service.js'))[0] ?? '', /R5/);
  });

  test('транзакція в сервісі заборонена', async () => {
    assert.match(
      (await restricted(TX, 'src/projects/service.js'))[0] ?? '',
      /транзакції/,
    );
  });

  test('try/catch у роуті й сервісі заборонено', async () => {
    assert.match(
      (await restricted(TRY, 'src/web/routes/x.js'))[0] ?? '',
      /глобальний обробник/,
    );
    assert.match(
      (await restricted(TRY, 'src/results/service.js'))[0] ?? '',
      /глобальний/,
    );
  });

  test('SQL і транзакції дозволені в repository.pg.js і platform/db', async () => {
    assert.deepEqual(
      await restricted(
        SQL + TX.replace('const f', 'const g'),
        'src/voting/repository.pg.js',
      ),
      [],
    );
    assert.deepEqual(await restricted(SQL, 'src/platform/db/connect.js'), []);
  });
});
