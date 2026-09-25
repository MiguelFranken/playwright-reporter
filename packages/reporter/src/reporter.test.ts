import { describe, expect, it, vi } from 'vitest';
import { EventQueue } from './queue';
import { detectCiRunId, isListMode, resolveOptions } from './options';
import { normalizeRemote } from './metadata';

describe('EventQueue', () => {
  it('flushes when full and keeps order', async () => {
    const sent: number[][] = [];
    const q = new EventQueue(
      2,
      10_000,
      async (evs) => {
        sent.push(evs.map((e) => e.seq));
      },
      2,
    );
    for (let i = 0; i < 5; i++) q.push({ seq: q.nextSeq(), type: 'run.log', level: 'info', message: 'x' });
    await q.drain();
    expect(sent).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('folds what arrives during a slow send into the next request', async () => {
    const sent: number[][] = [];
    let release!: () => void;
    const q = new EventQueue(1, 10_000, async (evs) => {
      sent.push(evs.map((e) => e.seq));
      if (sent.length === 1) await new Promise<void>((r) => (release = r));
    });
    q.push({ seq: q.nextSeq(), type: 'run.log', level: 'info', message: 'x' });
    await Promise.resolve();
    // The first request is in flight; these four would each have been a request of their own.
    for (let i = 0; i < 4; i++) q.push({ seq: q.nextSeq(), type: 'run.log', level: 'info', message: 'x' });
    release();
    await q.drain();
    expect(sent).toEqual([[0], [1, 2, 3, 4]]);
  });

  it('keeps a request under the size limit', async () => {
    const sent: number[] = [];
    const q = new EventQueue(1000, 10_000, async (evs) => {
      sent.push(evs.length);
    });
    const big = 'x'.repeat(300 * 1024);
    for (let i = 0; i < 5; i++) q.push({ seq: q.nextSeq(), type: 'run.log', level: 'info', message: big });
    await q.drain();
    expect(sent).toEqual([3, 2]);
  });

  it('flushes on interval', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => {});
    const q = new EventQueue(100, 50, send);
    q.push({ seq: 0, type: 'run.log', level: 'info', message: 'x' });
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60);
    expect(send).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('options', () => {
  it('returns null without token', () => {
    expect(resolveOptions({}, {})).toBeNull();
  });
  it('reads env vars', () => {
    const o = resolveOptions(
      {},
      {
        PW_REPORTER_TOKEN: 't',
        PW_REPORTER_URL: 'http://x/',
        PW_REPORTER_TAGS: 'a, b',
        PW_REPORTER_ARTIFACTS: 'false',
      },
    );
    expect(o).toMatchObject({ token: 't', serverUrl: 'http://x', tags: ['a', 'b'], artifacts: false });
  });
  it('beats every 30 seconds unless told otherwise', () => {
    const env = { PW_REPORTER_TOKEN: 't', PW_REPORTER_URL: 'http://x' };
    expect(resolveOptions({}, env)?.heartbeatIntervalMs).toBe(30_000);
    expect(resolveOptions({}, { ...env, PW_REPORTER_HEARTBEAT_MS: '0' })?.heartbeatIntervalMs).toBe(0);
    expect(resolveOptions({}, { ...env, PW_REPORTER_HEARTBEAT_MS: 'often' })?.heartbeatIntervalMs).toBe(30_000);
    expect(resolveOptions({ heartbeatIntervalMs: 5000 }, { ...env, PW_REPORTER_HEARTBEAT_MS: '0' })?.heartbeatIntervalMs).toBe(5000);
  });
  it('reads git and CI overrides from env and ignores blank ones', () => {
    const o = resolveOptions(
      {},
      {
        PW_REPORTER_TOKEN: 't',
        PW_REPORTER_URL: 'http://x',
        PW_REPORTER_GIT_BRANCH: 'stage',
        PW_REPORTER_GIT_SHA: '',
        PW_REPORTER_GIT_REPO_URL: 'https://gitlab.example/mop/app',
        PW_REPORTER_BUILD_URL: 'https://logs.example/1',
      },
    );
    expect(o?.git).toEqual({ branch: 'stage', repoUrl: 'https://gitlab.example/mop/app' });
    expect(o?.ci).toEqual({ buildUrl: 'https://logs.example/1' });
  });
  it('reads the pull request from env, with or without its sigil', () => {
    const env = { PW_REPORTER_TOKEN: 't', PW_REPORTER_URL: 'http://x', PW_REPORTER_PR_URL: 'https://gitlab.example/a/-/merge_requests/7', PW_REPORTER_PR_TITLE: 'Fix' };
    expect(resolveOptions({}, { ...env, PW_REPORTER_PR_NUMBER: '!7' })?.git).toEqual({ prNumber: 7, prUrl: env.PW_REPORTER_PR_URL, prTitle: 'Fix' });
    expect(resolveOptions({}, { ...env, PW_REPORTER_PR_NUMBER: '#7' })?.git.prNumber).toBe(7);
    expect(resolveOptions({}, { ...env, PW_REPORTER_PR_NUMBER: 'seven' })?.git.prNumber).toBeUndefined();
    expect(resolveOptions({ git: { prNumber: '12' } }, env)?.git.prNumber).toBe(12);
  });
  it('prefers explicit options over env', () => {
    const o = resolveOptions({ token: 't', serverUrl: 'http://x', git: { branch: 'main' } }, { PW_REPORTER_GIT_BRANCH: 'stage' });
    expect(o?.git.branch).toBe('main');
  });
  it('detects github run id', () => {
    expect(detectCiRunId({ GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '2' })).toBe('gh-1-2');
  });
});

describe('normalizeRemote', () => {
  it('converts ssh remotes', () => {
    expect(normalizeRemote('git@github.com:org/repo.git')).toBe('https://github.com/org/repo');
  });
});

describe('isListMode', () => {
  it('recognises `playwright test --list`', () => {
    expect(isListMode(['node', 'playwright', 'test', 'tests/footer', '--list'])).toBe(true);
    expect(isListMode(['node', 'playwright', 'test', 'tests/footer'])).toBe(false);
  });
});
