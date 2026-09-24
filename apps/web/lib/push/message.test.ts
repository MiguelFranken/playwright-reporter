import { describe, expect, test } from 'vitest';
import { runMessage, type RunNotificationSubject } from './message';

const run: RunNotificationSubject = {
  id: '5b0c7d8e-0000-4000-8000-000000000001',
  number: 42,
  status: 'running',
  endReason: null,
  durationMs: null,
  gitBranch: 'main',
  gitMessage: 'Fix the login form\n\nLonger body',
  gitShortSha: 'abc1234',
  project: { slug: 'web', name: 'Web' },
  team: { slug: 'acme' },
};

describe('runMessage', () => {
  test('a start names the run, its branch and commit, and links to it', () => {
    expect(runMessage('started', run)).toEqual({
      title: 'Web: run #42 started',
      body: 'main · Fix the login form',
      url: '/teams/acme/projects/web/runs/42',
      tag: `run-${run.id}`,
    });
  });

  test('a finish carries the result, its counts and duration, under the same tag', () => {
    const msg = runMessage('finished', { ...run, status: 'failed', durationMs: 125_000 }, { passed: 10, failed: 2, flaky: 1, skipped: 0 });
    expect(msg.title).toBe('Web: run #42 failed');
    expect(msg.body).toBe('2 failed, 1 flaky, 10 passed · 2m 5s\nmain · Fix the login form');
    expect(msg.tag).toBe(runMessage('started', run).tag);
  });

  test('a run closed by its watchdog reads as abandoned', () => {
    expect(runMessage('finished', { ...run, status: 'incomplete', endReason: 'stale' }).title).toBe('Web: run #42 abandoned');
  });

  test('a run without a branch or message is named by its commit hash', () => {
    expect(runMessage('started', { ...run, gitBranch: null, gitMessage: null }).body).toBe('Commit abc1234');
  });
});
