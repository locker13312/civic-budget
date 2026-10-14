import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import {
  PAGE_WORDS,
  checkAdr,
  checkCriteria,
  checkPage,
  run,
} from '../../scripts/check-docs.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SPEC = 'tasks/07-x/spec.md';

/** @param {string} choice */
const adr = (choice) => `---
status: accepted
date: 2026-10-14
---
# Обрати щось

## Контекст і проблема
## Розглянуті варіанти

* Варіант А
* Варіант Б

## Рішення

Обрано: «${choice}», бо так.

### Наслідки
### Підтвердження
`;

describe('[AC-1.8] перевірка документів', () => {
  test('документи репозиторію проходять перевірку', () => {
    assert.deepEqual(run(ROOT), []);
  });

  test('обраний варіант ADR має бути з переліку', () => {
    const path = 'adr/0009-obraty-shchos.md';

    assert.deepEqual(checkAdr(path, adr('Варіант Б')), []);
    assert.ok(checkAdr(path, adr('В')).some((e) => e.includes('відсутній у переліку')));
  });

  test('критерій з «тест» потребує тесту з тегом', () => {
    const table = '| AC-7.1 | щось видно | тест |\n';

    assert.deepEqual(checkCriteria(SPEC, table, 7, new Set(['AC-7.1']), new Set()), []);
    assert.notDeepEqual(checkCriteria(SPEC, table, 7, new Set(), new Set()), []);
  });

  test('make-ціль з колонки «Перевірка» має існувати', () => {
    const table = '| AC-7.1 | щось видно | `make demo` |\n';

    assert.deepEqual(checkCriteria(SPEC, table, 7, new Set(), new Set(['demo'])), []);
    assert.notDeepEqual(checkCriteria(SPEC, table, 7, new Set(), new Set()), []);
  });

  test('ID критерію відповідає номеру завдання', () => {
    const table = '| AC-3.1 | щось видно | тест |\n';
    const errors = checkCriteria(SPEC, table, 7, new Set(['AC-3.1']), new Set());

    assert.ok(errors.some((e) => e.includes('AC-7')));
  });

  test('ліміт сторінки не рахує блоки коду', () => {
    const sections = ['Що і навіщо'];
    const code = '```\n' + 'слово '.repeat(PAGE_WORDS * 2) + '\n```\n';
    const long = 'слово '.repeat(PAGE_WORDS + 1);

    assert.deepEqual(
      checkPage(SPEC, `## Що і навіщо\n${code}`, sections, PAGE_WORDS),
      [],
    );
    assert.notDeepEqual(
      checkPage(SPEC, `## Що і навіщо\n${long}`, sections, PAGE_WORDS),
      [],
    );
  });
});
