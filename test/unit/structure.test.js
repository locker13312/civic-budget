import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../../', import.meta.url);

/** @returns {Set<string>} */
export function modulesInSpec() {
  const text = readFileSync(new URL('spec.md', ROOT), 'utf8');
  const section = text.split('## Компоненти і взаємодія')[1]?.split('\n## ')[0] ?? '';
  return new Set([...section.matchAll(/^\| `(\w+)` \|/gm)].map((m) => String(m[1])));
}

/** @returns {Set<string>} */
function modulesInCode() {
  const src = new URL('src/', ROOT);
  return new Set(
    readdirSync(src, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(new URL(`${entry.name}/index.js`, src)))
      .map((entry) => entry.name),
  );
}

test('[AC-1.6] теки src/* збігаються з модулями spec.md', () => {
  const inSpec = modulesInSpec();

  assert.ok(inSpec.size > 0, 'у spec.md не знайдено таблицю модулів');
  assert.deepEqual(modulesInCode(), inSpec);
});
