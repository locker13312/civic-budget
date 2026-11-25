// конфігурація CI/CD (AC-4.1, AC-4.2, AC-4.8): що перевіряється на кожен PR,
// які задачі обов'язкові для мерджа і як задача deploy чекає на стейдж
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { parse } from 'yaml';

import {
  REQUIRED_CHECKS,
  protectionProblems,
  protectionRules,
} from '../../scripts/ci-protection.js';
import { triggerDeploy, waitForVersion } from '../../scripts/deploy-stage.js';

const workflow = parse(
  readFileSync(new URL('../../.github/workflows/check.yml', import.meta.url), 'utf8'),
);
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
/**
 * @param {string} job
 * @returns {string} усі команди задачі одним рядком
 */
const commands = (job) =>
  workflow.jobs[job].steps
    .map((/** @type {{ run?: string }} */ step) => step.run ?? '')
    .join('\n');

describe('[AC-4.1] CI на кожен PR', () => {
  test('запускається на pull_request і на пуш у main', () => {
    assert.ok('pull_request' in workflow.on);
    assert.deepEqual(workflow.on.push.branches, ['main']);
  });

  test('check: стиль, лінт, тести і npm pack через npm run check', () => {
    const check = packageJson.scripts.check;

    assert.match(commands('check'), /npm run --silent check/);
    for (const part of ['fmt-check', 'lint', 'types', 'test', 'build']) {
      assert.match(check, new RegExp(`npm run ${part}\\b`), part);
    }
    assert.deepEqual(workflow.jobs.check.strategy.matrix.os, [
      'ubuntu-latest',
      'windows-latest',
    ]);
  });

  test('commits: усі коміти PR від base до head', () => {
    assert.equal(workflow.jobs.commits.if, "github.event_name == 'pull_request'");
    assert.match(
      commands('commits'),
      /scripts\/commitlint\.js \$\{\{ github\.event\.pull_request\.base\.sha \}\}\s+\$\{\{ github\.event\.pull_request\.head\.sha \}\}/,
    );
    assert.equal(workflow.jobs.commits.steps[0].with['fetch-depth'], 0);
  });

  test('build: docker build, тест контейнера, лише потім push у GHCR', () => {
    const run = commands('build');

    assert.ok(run.indexOf('docker build') < run.indexOf('npm run test:container'));
    assert.ok(run.indexOf('npm run test:container') < run.indexOf('docker push'));
    assert.equal(workflow.jobs.build.env.CIVIC_REQUIRE_DB, '1');
  });
});

describe("[AC-4.2] обов'язкові перевірки для мерджа", () => {
  test("обов'язкові задачі існують у CI під тими самими назвами", () => {
    const names = [
      ...workflow.jobs.check.strategy.matrix.os.map(
        (/** @type {string} */ os) => `check (${os})`,
      ),
      ...Object.keys(workflow.jobs),
    ];
    for (const check of REQUIRED_CHECKS) {
      assert.ok(names.includes(check), check);
    }
  });

  test('правила: актуальна гілка, без обходу адміном, лише PR, без force-push', () => {
    const rules = /** @type {import('../api/scenarios.js').Json} */ (protectionRules());

    assert.deepEqual(rules.required_status_checks, {
      strict: true,
      contexts: REQUIRED_CHECKS,
    });
    assert.equal(rules.enforce_admins, true);
    assert.equal(rules.allow_force_pushes, false);
    assert.ok(rules.required_pull_request_reviews);
  });

  test('розбіжності з GitHub називаються', () => {
    assert.deepEqual(protectionProblems(null), ['гілка main не захищена']);
    assert.deepEqual(
      protectionProblems({
        required_status_checks: { strict: false, contexts: ['commits'] },
        enforce_admins: { enabled: false },
        required_pull_request_reviews: null,
        allow_force_pushes: { enabled: true },
      }),
      [
        "перевірка «check (ubuntu-latest)» не обов'язкова",
        "перевірка «build» не обов'язкова",
        'гілка PR може бути не актуальною з main',
        'адміністратор може обійти правила',
        'можна пушити в main без PR',
        'force-push дозволено',
      ],
    );
  });
});

describe('[AC-4.8] задача deploy', () => {
  test('запускається лише на пуш у main і після check і build', () => {
    const deploy = workflow.jobs.deploy;

    assert.equal(
      deploy.if,
      "github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
    assert.deepEqual(deploy.needs, ['check', 'build']);
    assert.match(commands('deploy'), /node scripts\/deploy-stage\.js/);
    // раннер не отримує доступу до БД стейджу: лише hook і адреса
    assert.deepEqual(Object.keys(deploy.steps.at(-1).env).sort(), [
      'IMAGE',
      'RENDER_DEPLOY_HOOK_URL',
      'SHA',
      'STAGE_URL',
    ]);
  });

  /**
   * Підставний /version: віддає по черзі відповіді зі списку.
   *
   * @param {Array<string | Error | number>} answers sha, помилка мережі або HTTP-статус
   */
  const stage = (answers) => {
    let i = 0;
    let clock = 0;
    return {
      fetch: /** @type {typeof fetch} */ (
        async () => {
          const answer = answers[Math.min(i, answers.length - 1)];
          i += 1;
          if (answer instanceof Error) {
            throw answer;
          }
          if (typeof answer === 'number') {
            return new Response('', { status: answer });
          }
          return Response.json({ version: '0.1.0', sha: answer });
        }
      ),
      sleep: async (/** @type {number} */ ms) => {
        clock += ms;
      },
      now: () => clock,
    };
  };
  const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

  test('чекає крізь сон стейджу і стару версію, доки /version не поверне sha', async () => {
    const result = await waitForVersion({
      stageUrl: 'https://stage.example',
      sha: SHA,
      ...stage([new Error('fetch failed'), 502, 'oldoldoldold', 'abcdef123456']),
    });

    assert.deepEqual(result, { attempts: 4 });
  });

  test('падає, якщо до дедлайну стейдж так і не віддав цей sha', async () => {
    await assert.rejects(
      waitForVersion({
        stageUrl: 'https://stage.example',
        sha: SHA,
        timeoutMs: 60_000,
        intervalMs: 10_000,
        ...stage(['oldoldoldold']),
      }),
      /не віддав abcdef123456 за 60 с; остання відповідь: oldoldoldold/,
    );
  });

  test('deploy hook отримує тег образу цього коміту; інша відповідь — помилка', async () => {
    /** @type {string[]} */
    const calls = [];
    /**
     * @param {number} status
     * @returns {typeof fetch}
     */
    const hook = (status) => async (url) => {
      calls.push(String(url));
      return new Response('', { status });
    };

    const status = await triggerDeploy({
      hookUrl: 'https://api.render.com/deploy/srv-x?key=k',
      image: `ghcr.io/locker13312/civic-budget:${SHA}`,
      fetch: hook(202),
    });

    assert.equal(status, 202);
    assert.equal(
      new URL(/** @type {string} */ (calls[0])).searchParams.get('imgURL'),
      `ghcr.io/locker13312/civic-budget:${SHA}`,
    );
    await assert.rejects(
      triggerDeploy({ hookUrl: 'https://h.example/d', image: 'i:1', fetch: hook(400) }),
      /відповів 400/,
    );
  });
});
