// npm prepare: вмикає .githooks, лише якщо це робоча копія git
// (npm pack у знімку хука або встановлення з архіву git не мають)
import { execFileSync } from 'node:child_process';

/**
 * @param {string[]} args
 * @returns {string}
 */
function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

try {
  if (git(['rev-parse', '--is-inside-work-tree']) === 'true') {
    git(['config', 'core.hooksPath', '.githooks']);
  }
} catch {
  // немає git або це не репозиторій: хуки не потрібні
}
