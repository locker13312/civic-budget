// перевірка повідомлень комітів (AC-4.3):
//   node scripts/commitlint.js --edit <файл>   — хук commit-msg
//   node scripts/commitlint.js <base> <head>   — усі коміти PR у CI
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import format from '@commitlint/format';
import lint from '@commitlint/lint';
import load from '@commitlint/load';

/**
 * @param {string[]} args
 * @returns {{ sha: string, message: string }[]}
 */
function messages(args) {
  if (args[0] === '--edit') {
    const file = args[1] ?? '.git/COMMIT_EDITMSG';
    return [{ sha: 'новий коміт', message: readFileSync(file, 'utf8') }];
  }
  const [base, head] = args;
  if (!base || !head) {
    throw new Error('очікую --edit <файл> або <base> <head>');
  }
  const out = execFileSync('git', ['log', '--format=%H%x00%B%x01', `${base}..${head}`], {
    encoding: 'utf8',
  });
  return out
    .split('\x01')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sha = '', message = ''] = chunk.split('\x00');
      return { sha: sha.slice(0, 12), message };
    });
}

const config = await load({}, { cwd: process.cwd() });
const options = {
  parserOpts: config.parserPreset?.parserOpts ?? {},
  plugins: config.plugins,
  ignores: config.ignores,
  defaultIgnores: config.defaultIgnores,
};
let failed = 0;
for (const { sha, message } of messages(process.argv.slice(2))) {
  const report = await lint(message, config.rules, options);
  if (!report.valid) {
    failed += 1;
    console.error(`✖ ${sha}: ${message.split('\n')[0]}`);
    console.error(format({ results: [report] }, { color: false, verbose: false }));
  }
}
if (failed > 0) {
  console.error(
    `${failed} коміт(ів) не у форматі conventional commits: <тип>(<область>): <опис>`,
  );
  process.exit(1);
}
