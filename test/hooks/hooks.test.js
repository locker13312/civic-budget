// хуки перевіряються на справжньому git у тимчасовому репозиторії
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, test } from 'node:test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKIP = new Set(['.git', 'node_modules', 'dist', 'coverage']);

// не відформатовано (prettier) і без крапок з комою
const DIRTY = 'const x=1\nexport default x\n';
const CLEAN = 'const x = 1;\nexport default x;\n';
// формат і лінтер чисті, tsc ні
// формат, лінтер і knip чисті, tsc ні; дописується в наявний файл, бо новий
// невикористаний файл knip у pre-push теж відхилить
const TYPE_ERROR = "\n/** @type {number} */\nconst answer = 'один';\nvoid answer;\n";
const USED_FILE = 'src/platform/config.js';
const NEW_FILE = 'src/platform/sample.js';
// формат і лінтер чисті, порушено лише R2
const SHORTCUT =
  "import { submit } from '../projects/domain.js';\n\nexport default submit;\n";

const nested = process.env.CIVIC_NESTED === '1';
/** @type {string[]} */
const cleanup = [];

after(() => {
  for (const dir of cleanup) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'civic-hooks-'));
  cleanup.push(base);
  const path = join(base, 'repo');
  cpSync(ROOT, path, {
    recursive: true,
    filter: (src) => !SKIP.has(relative(ROOT, src).split('/')[0] ?? ''),
  });

  /** @type {NodeJS.ProcessEnv} */
  const env = {
    ...process.env,
    CIVIC_NODE_MODULES: process.env.CIVIC_NODE_MODULES ?? join(ROOT, 'node_modules'),
    CIVIC_NESTED: '1',
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  // змінні, які git виставляє, коли тести запускає сам хук
  for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    delete env[name];
  }

  /** @param {string[]} args */
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: path, env, encoding: 'utf8' });
    return { code: result.status, output: `${result.stdout}${result.stderr}` };
  };
  /**
   * @param {string} file
   * @param {string} text
   */
  const write = (file, text) => writeFileSync(join(path, file), text);
  /**
   * @param {string} file
   * @param {string} text
   */
  const append = (file, text) => appendFileSync(join(path, file), text);
  /** @param {string} message */
  const commit = (message) => git('commit', '-m', message);

  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  const first = git('-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'init');
  assert.equal(first.code, 0, first.output);
  git('config', 'core.hooksPath', '.githooks');
  return { base, git, write, append, commit };
}

describe('git-хуки', { skip: nested && 'вкладений запуск з тесту хуків' }, () => {
  test('[AC-1.2] pre-commit відхиляє брудний коміт і пропускає чистий', () => {
    const repo = sandbox();
    repo.write(NEW_FILE, DIRTY);
    repo.git('add', NEW_FILE);

    const blocked = repo.commit('dirty');

    assert.notEqual(blocked.code, 0);
    assert.match(blocked.output, /коміт відхилено/);
    assert.equal(repo.git('rev-list', '--count', 'HEAD').output.trim(), '1');

    repo.write(NEW_FILE, CLEAN);
    repo.git('add', NEW_FILE);

    const passed = repo.commit('clean');

    assert.equal(passed.code, 0, passed.output);
  });

  test('[AC-1.3] неіндексована брудна правка не блокує чистий коміт', () => {
    const repo = sandbox();
    repo.write(NEW_FILE, CLEAN);
    repo.git('add', NEW_FILE);
    repo.write(NEW_FILE, DIRTY);

    const result = repo.commit('staged is clean');

    assert.equal(result.code, 0, result.output);
  });

  test('[AC-1.3] брудний staged-файл блокує коміт навіть після виправлення в робочій копії', () => {
    const repo = sandbox();
    repo.write(NEW_FILE, DIRTY);
    repo.git('add', NEW_FILE);
    repo.write(NEW_FILE, CLEAN);

    const result = repo.commit('staged is dirty');

    assert.notEqual(result.code, 0);
    assert.match(result.output, /коміт відхилено/);
  });

  test('[AC-1.4] pre-push запускає повний make check', () => {
    const repo = sandbox();
    const remote = join(repo.base, 'remote.git');
    spawnSync('git', ['init', '-q', '--bare', remote]);
    repo.git('remote', 'add', 'origin', remote);

    // pre-commit пропускає (формат і лінтер чисті), ловить лише tsc
    repo.append(USED_FILE, TYPE_ERROR);
    repo.git('add', USED_FILE);
    assert.equal(repo.commit('type error').code, 0);

    const rejected = repo.git('push', 'origin', 'main');

    assert.notEqual(rejected.code, 0);
    assert.match(rejected.output, /push відхилено/);

    repo.git('checkout', 'HEAD~1', '--', USED_FILE);
    repo.git('add', USED_FILE);
    assert.equal(repo.commit('fix types').code, 0);

    const accepted = repo.git('push', 'origin', 'main');

    assert.equal(accepted.code, 0, accepted.output);
  });

  test('[AC-1.9] pre-commit відхиляє імпорт у внутрішній файл іншого модуля', () => {
    const repo = sandbox();
    repo.write('src/voting/shortcut.js', SHORTCUT);
    repo.git('add', 'src/voting/shortcut.js');

    const result = repo.commit('reach into projects internals');

    assert.notEqual(result.code, 0);
    assert.match(result.output, /R2-index-only/);
  });
});
