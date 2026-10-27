// після `stryker run`: копія JSON-звіту і таблиця невбитих мутантів з класами
// з tasks/03-testing/mutation-classes.json (AC-3.6).
// npm run mutation → reports/mutation/mutation.json → цей скрипт
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const SOURCE = new URL('reports/mutation/mutation.json', ROOT);
const TASK = new URL('tasks/03-testing/', ROOT);
export const CLASSES_FILE = new URL('mutation-classes.json', TASK);
export const REPORT_FILE = new URL('reports/mutation.json', TASK);
const TABLE_FILE = new URL('reports/mutation-survivors.md', TASK);

/** Класи вижилих мутантів зі spec Завдання 3. */
export const CLASSES = ['прогалина', 'еквівалентний', 'прийнятний'];

/**
 * @typedef {{ status: string, mutatorName: string, replacement?: string,
 *   location: { start: { line: number, column: number } } }} Mutant
 * @typedef {{ files: Record<string, { source: string, mutants: Mutant[] }> }} StrykerReport
 * @typedef {{ key: string, file: string, line: number, status: string, mutator: string,
 *   replacement: string, code: string }} Survivor
 * @typedef {Record<string, { class: string, reason: string }>} Classes
 */

/**
 * Стабільний ключ мутанта: файл, рядок, стовпчик, вид і заміна.
 *
 * @param {string} file
 * @param {Mutant} mutant
 * @returns {string}
 */
export function mutantKey(file, mutant) {
  const { line, column } = mutant.location.start;
  return `${file}:${line}:${column} ${mutant.mutatorName} → ${mutant.replacement ?? ''}`;
}

/**
 * Мутанти, яких тести не вбили: вижилі й непокриті.
 *
 * @param {StrykerReport} report
 * @returns {Survivor[]}
 */
export function survivors(report) {
  /** @type {Survivor[]} */
  const found = [];
  for (const [path, file] of Object.entries(report.files)) {
    const relative = path.replace(/^.*?(?=src\/)/, '');
    const lines = file.source.split('\n');
    for (const mutant of file.mutants) {
      if (mutant.status !== 'Survived' && mutant.status !== 'NoCoverage') {
        continue;
      }
      found.push({
        key: mutantKey(relative, mutant),
        file: relative,
        line: mutant.location.start.line,
        status: mutant.status,
        mutator: mutant.mutatorName,
        replacement: mutant.replacement ?? '',
        code: (lines[mutant.location.start.line - 1] ?? '').trim(),
      });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/**
 * @param {StrykerReport} report
 * @returns {{ killed: number, total: number, score: number }}
 */
export function score(report) {
  const all = Object.values(report.files).flatMap((f) => f.mutants);
  const valid = all.filter(
    (m) => m.status !== 'CompileError' && m.status !== 'RuntimeError',
  );
  const killed = valid.filter(
    (m) => m.status === 'Killed' || m.status === 'Timeout',
  ).length;
  return {
    killed,
    total: valid.length,
    score: Math.round((killed / valid.length) * 10_000) / 100,
  };
}

/**
 * @param {string} text
 * @returns {string}
 */
const cell = (text) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 90);

function main() {
  if (!existsSync(SOURCE)) {
    throw new Error('немає reports/mutation/mutation.json: спершу stryker run');
  }
  const report = /** @type {StrykerReport} */ (JSON.parse(readFileSync(SOURCE, 'utf8')));
  /** @type {Classes} */
  const classes = existsSync(CLASSES_FILE)
    ? JSON.parse(readFileSync(CLASSES_FILE, 'utf8'))
    : {};
  writeFileSync(REPORT_FILE, `${JSON.stringify(report)}\n`);

  const list = survivors(report);
  const { killed, total, score: value } = score(report);
  const rows = list.map((s) => {
    const known = classes[s.key];
    return `| ${s.file}:${s.line} | ${s.status} | ${s.mutator} → \`${cell(s.replacement)}\` | ${known?.class ?? '**не класифіковано**'} | ${cell(known?.reason ?? '')} |`;
  });
  writeFileSync(
    TABLE_FILE,
    [
      '# Невбиті мутанти',
      '',
      `Mutation score: **${value}%** (${killed} із ${total}). Згенеровано`,
      '`npm run mutation`; класи — у `tasks/03-testing/mutation-classes.json`.',
      '',
      '| Де | Статус | Мутація | Клас | Чому |',
      '|---|---|---|---|---|',
      ...rows,
      '',
    ].join('\n'),
  );
  const missing = list.filter((s) => !classes[s.key]).length;
  console.log(
    `mutation score ${value}%, невбитих ${list.length}, без класу ${missing}; таблиця: ${fileURLToPath(TABLE_FILE)}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
