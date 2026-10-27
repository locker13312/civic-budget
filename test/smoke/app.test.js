import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, test } from 'node:test';

import { resetGitShaCache, version } from '../../src/platform/index.js';
import { memoryApp } from '../support/app.js';

describe('[AC-1.5] smoke: застосунок стартує', () => {
  afterEach(() => {
    delete process.env.GIT_SHA;
    resetGitShaCache();
  });

  test('/health повертає 200', async () => {
    const response = await (
      await memoryApp()
    ).app.inject({ method: 'GET', url: '/health' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  });

  test('/version повертає sha з GIT_SHA', async () => {
    process.env.GIT_SHA = 'abc123def4567890';
    resetGitShaCache();

    const response = await (
      await memoryApp()
    ).app.inject({ method: 'GET', url: '/version' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { version, sha: 'abc123def456' });
  });

  test('/version без GIT_SHA бере sha з git', async (t) => {
    let head;
    try {
      head = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      t.skip('запуск не в git-репозиторії (знімок у хуку)');
      return;
    }
    delete process.env.GIT_SHA;
    resetGitShaCache();

    const response = await (
      await memoryApp()
    ).app.inject({ method: 'GET', url: '/version' });

    assert.equal(response.json().sha, head);
  });
});
