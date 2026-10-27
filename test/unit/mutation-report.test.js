// звіт мутацій (AC-3.6): кожен невбитий мутант зі збереженого звіту Stryker
// має клас і пояснення; застарілих записів класифікації немає
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import {
  CLASSES,
  CLASSES_FILE,
  REPORT_FILE,
  mutantKey,
  score,
  survivors,
} from '../../scripts/mutation-report.js';

/** @type {import('../../scripts/mutation-report.js').StrykerReport} */
const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8'));
/** @type {import('../../scripts/mutation-report.js').Classes} */
const classes = JSON.parse(readFileSync(CLASSES_FILE, 'utf8'));

describe('[AC-3.6] звіт мутацій', () => {
  test('кожен невбитий мутант має клас зі spec і пояснення', () => {
    const unexplained = survivors(report)
      .filter((s) => {
        const known = classes[s.key];
        return !known || !CLASSES.includes(known.class) || !known.reason.trim();
      })
      .map((s) => s.key);

    assert.deepEqual(unexplained, []);
  });

  test('класифікація не містить мутантів, яких у звіті вже немає', () => {
    const current = new Set(survivors(report).map((s) => s.key));

    assert.deepEqual(
      Object.keys(classes).filter((key) => !current.has(key)),
      [],
    );
  });

  test('[AC-3.5] збережений звіт не нижче порогу 70%', () => {
    assert.ok(score(report).score >= 70, `mutation score ${score(report).score}%`);
  });
});

describe('mutation-report: розбір звіту Stryker', () => {
  /**
   * @param {string} status
   * @param {number} line
   * @returns {import('../../scripts/mutation-report.js').Mutant}
   */
  const mutant = (status, line) => ({
    status,
    mutatorName: 'EqualityOperator',
    replacement: 'a <= b',
    location: { start: { line, column: 7 } },
  });
  /** @type {import('../../scripts/mutation-report.js').StrykerReport} */
  const sample = {
    files: {
      '/abs/path/src/x/domain.js': {
        source: 'one\nif (a < b) {\n',
        mutants: [
          mutant('Killed', 1),
          mutant('Survived', 2),
          mutant('NoCoverage', 2),
          mutant('Timeout', 1),
          mutant('CompileError', 1),
        ],
      },
    },
  };

  test('невбиті — це вижилі й непокриті; шлях від src/, рядок коду обрізано', () => {
    const found = survivors(sample);

    assert.deepEqual(
      found.map((s) => [s.key, s.status, s.code]),
      [
        ['src/x/domain.js:2:7 EqualityOperator → a <= b', 'Survived', 'if (a < b) {'],
        ['src/x/domain.js:2:7 EqualityOperator → a <= b', 'NoCoverage', 'if (a < b) {'],
      ],
    );
    assert.equal(found[0]?.key, mutantKey('src/x/domain.js', mutant('Survived', 2)));
  });

  test('score рахує вбитих і таймаути серед валідних мутантів', () => {
    assert.deepEqual(score(sample), { killed: 2, total: 4, score: 50 });
  });
});
