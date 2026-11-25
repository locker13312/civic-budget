// npm run ci:protection [-- --apply] (AC-4.2): правила гілки main — одне
// джерело правди. Без --apply звіряє правила на GitHub з цими, з --apply
// записує їх (потрібен gh з правами адміністратора репозиторію).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** @typedef {ReturnType<typeof JSON.parse>} Json розібраний JSON-відповіді */

export const BRANCH = 'main';
/** Задачі CI, без яких мердж неможливий (spec Завдання 4). */
export const REQUIRED_CHECKS = ['check (ubuntu-latest)', 'commits', 'build'];

/** @returns {object} тіло PUT /repos/{repo}/branches/{branch}/protection */
export function protectionRules() {
  return {
    // перевірки зелені на останньому коміті гілки, актуальної з main
    required_status_checks: { strict: true, contexts: REQUIRED_CHECKS },
    // адміністратор теж не обходить правила
    enforce_admins: true,
    // лише через PR; схвалень 0 — у репозиторії один автор
    required_pull_request_reviews: { required_approving_review_count: 0 },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  };
}

/**
 * Розбіжності між правилами на GitHub і protectionRules().
 *
 * @param {Json} actual відповідь GET …/protection (null — захисту немає)
 * @returns {string[]}
 */
export function protectionProblems(actual) {
  if (!actual) {
    return [`гілка ${BRANCH} не захищена`];
  }
  /** @type {string[]} */
  const problems = [];
  const contexts = new Set(actual.required_status_checks?.contexts ?? []);
  for (const check of REQUIRED_CHECKS) {
    if (!contexts.has(check)) {
      problems.push(`перевірка «${check}» не обов'язкова`);
    }
  }
  if (!actual.required_status_checks?.strict) {
    problems.push('гілка PR може бути не актуальною з main');
  }
  if (!actual.enforce_admins?.enabled) {
    problems.push('адміністратор може обійти правила');
  }
  if (!actual.required_pull_request_reviews) {
    problems.push('можна пушити в main без PR');
  }
  if (actual.allow_force_pushes?.enabled) {
    problems.push('force-push дозволено');
  }
  return problems;
}

/**
 * @param {string[]} args
 * @param {string} [input]
 * @returns {string}
 */
function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input });
}

function main() {
  const repo = gh([
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ]).trim();
  const path = `repos/${repo}/branches/${BRANCH}/protection`;
  if (process.argv.includes('--apply')) {
    gh(['api', '-X', 'PUT', path, '--input', '-'], JSON.stringify(protectionRules()));
    console.log(`правила ${repo}@${BRANCH} записано`);
  }
  /** @type {Json} */
  let actual = null;
  try {
    actual = JSON.parse(gh(['api', path]));
  } catch {
    // 404: гілка не захищена
  }
  const problems = protectionProblems(actual);
  for (const line of problems) {
    console.error(`✖ ${line}`);
  }
  if (problems.length > 0) {
    process.exit(1);
  }
  console.log(
    `✔ ${repo}@${BRANCH}: мердж лише через PR із зеленими ${REQUIRED_CHECKS.join(', ')}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
