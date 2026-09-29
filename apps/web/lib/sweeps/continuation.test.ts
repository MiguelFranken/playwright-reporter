import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTINUATION_HEADER, MAX_CONTINUATIONS, continuationLink, ingestSweepDue, requestContinuation, shouldContinue } from './continuation';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-29T12:00:00Z');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('ingestSweepDue', () => {
  const sweep = (ageHours: number, rest: Partial<{ finishedAt: Date | null; hasMore: boolean; error: string | null }> = {}) => ({
    startedAt: new Date(NOW - ageHours * HOUR),
    finishedAt: new Date(NOW - ageHours * HOUR + 60_000),
    hasMore: false,
    error: null,
    ...rest,
  });

  it('sweeps when none ran, or none within the interval', () => {
    expect(ingestSweepDue(undefined, 12 * HOUR, NOW)).toBe(true);
    expect(ingestSweepDue(sweep(13), 12 * HOUR, NOW)).toBe(true);
    expect(ingestSweepDue(sweep(1), 12 * HOUR, NOW)).toBe(false);
  });

  it('continues a recent sweep that ran out of time', () => {
    expect(ingestSweepDue(sweep(1, { hasMore: true }), 12 * HOUR, NOW)).toBe(true);
  });

  it('leaves a recent sweep alone while it runs, or when it failed', () => {
    expect(ingestSweepDue(sweep(0, { hasMore: true, finishedAt: null }), 12 * HOUR, NOW)).toBe(false);
    expect(ingestSweepDue(sweep(1, { hasMore: true, error: 'store down' }), 12 * HOUR, NOW)).toBe(false);
  });
});

describe('shouldContinue', () => {
  it('continues a sweep that stopped at its budget and got something done', () => {
    expect(shouldContinue({ hasMore: true, error: null }, 1700, 0)).toBe(true);
  });

  it('stops when done, failed, stuck, or at the cap', () => {
    expect(shouldContinue({ hasMore: false, error: null }, 10, 0)).toBe(false);
    expect(shouldContinue({ hasMore: true, error: 'boom' }, 10, 0)).toBe(false);
    expect(shouldContinue({ hasMore: true, error: null }, 0, 0)).toBe(false);
    expect(shouldContinue({ hasMore: true, error: null }, 10, MAX_CONTINUATIONS)).toBe(false);
  });
});

describe('continuationLink', () => {
  const req = (value?: string) => new Request('https://x.test', { headers: value ? { [CONTINUATION_HEADER]: value } : {} });

  it('reads a positive link number, and treats anything else as the start of a chain', () => {
    expect(continuationLink(req('3'))).toBe(3);
    expect(continuationLink(req())).toBe(0);
    expect(continuationLink(req('-1'))).toBe(0);
    expect(continuationLink(req('abc'))).toBe(0);
  });
});

describe('requestContinuation', () => {
  it('does nothing without CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await requestContinuation('artifacts', 1)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls the kind’s cron endpoint on the public origin, with the secret and the link', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    vi.stubEnv('BASE_URL', 'https://reports.example.test/');
    const fetch = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    expect(await requestContinuation('data', 2)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://reports.example.test/api/cron/data-retention',
      expect.objectContaining({ method: 'POST', headers: { authorization: 'Bearer s3cret', [CONTINUATION_HEADER]: '2' } }),
    );
  });

  it('reports a refused or failed call instead of throwing', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    expect(await requestContinuation('artifacts', 1)).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await requestContinuation('artifacts', 1)).toBe(false);
  });
});
