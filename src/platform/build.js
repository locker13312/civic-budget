import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadSettings } from './config.js';

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

/** @type {string} */
export const version = pkg.version;

/** @type {string | undefined} */
let cached;

/**
 * Sha коміту, з якого зібрано застосунок.
 *
 * @returns {string}
 */
export function gitSha() {
  // у CI і `make run` sha передається через GIT_SHA, локально питаємо git
  cached ??= loadSettings().gitSha?.slice(0, 12) ?? fromGit();
  return cached;
}

/** Для тестів: наступний виклик gitSha() прочитає sha заново. */
export function resetGitShaCache() {
  cached = undefined;
}

function fromGit() {
  try {
    const out = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return out.trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}
