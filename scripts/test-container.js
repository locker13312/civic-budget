// npm run test:container (AC-4.4): збирає образ з Dockerfile і запускає
// test/container проти нього. У CI образ уже зібрано задачею build —
// тоді CIVIC_IMAGE вказує на нього, і повторного збирання немає.
import { execFileSync, spawnSync } from 'node:child_process';

/**
 * @param {string[]} args
 * @returns {string}
 */
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const sha = process.env.GIT_SHA ?? git(['rev-parse', '--short=12', 'HEAD']);
let image = process.env.CIVIC_IMAGE;
if (!image) {
  image = `civic-budget:${sha}`;
  const build = spawnSync(
    'docker',
    ['build', '--build-arg', `GIT_SHA=${sha}`, '-t', image, '.'],
    { stdio: 'inherit' },
  );
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}
const test = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=spec', 'test/container/*.test.js'],
  {
    stdio: 'inherit',
    env: { ...process.env, CIVIC_IMAGE: image, GIT_SHA: sha },
  },
);
process.exit(test.status ?? 1);
