import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
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

test('[AC-1.9] правила меж покривають кожен модуль spec.md', () => {
  const require = createRequire(import.meta.url);
  /** @type {{ forbidden: Array<{ name: string }> }} */
  const config = require('../../.dependency-cruiser.cjs');
  const names = config.forbidden.map((rule) => rule.name);
  const layered = new Set(
    names
      .filter((n) => n.startsWith('R1-') && n !== 'R1-no-cycles')
      .map((n) => n.slice(3)),
  );

  assert.deepEqual(layered, modulesInSpec(), 'R1: правило для кожного модуля spec');
  assert.ok(names.includes('R2-index-only'), 'R2: лише через index.js');
  assert.ok(names.includes('R4-fastify-only-in-web'), 'R4: fastify лише у web');
});
