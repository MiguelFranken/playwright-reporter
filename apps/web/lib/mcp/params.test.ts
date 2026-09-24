import { describe, expect, it } from 'vitest';
import { ToolError } from './errors';
import { nextCursor, parseAppUrl, parseDuration, parseRunRef, parseTimeBound, readPage, timeWindow } from './params';

const NOW = new Date('2026-09-24T12:00:00Z');

describe('durations and time bounds', () => {
  it('parses minutes, hours, days and weeks', () => {
    expect(parseDuration('90m')).toBe(90 * 60_000);
    expect(parseDuration('24h')).toBe(86_400_000);
    expect(parseDuration('7d')).toBe(7 * 86_400_000);
    expect(parseDuration('2w')).toBe(14 * 86_400_000);
    expect(parseDuration('7 days')).toBeNull();
  });

  it('reads a duration back from now, or an ISO date', () => {
    expect(parseTimeBound('24h', NOW).toISOString()).toBe('2026-09-23T12:00:00.000Z');
    expect(parseTimeBound('2026-09-01', NOW).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(() => parseTimeBound('yesterday', NOW)).toThrow(ToolError);
  });

  it('clamps a window to the maximum and says so', () => {
    const w = timeWindow({ since: '400d' }, { defaultSince: '30d', max: '180d' }, NOW);
    expect(w.clamped).toBe(true);
    expect(w.days).toBe(180);
    expect(timeWindow({}, { defaultSince: '30d' }, NOW)).toMatchObject({ days: 30, label: 'last 30 days', clamped: false });
  });

  it('rejects an end before the start', () => {
    expect(() => timeWindow({ since: '1d', until: '2d' }, { defaultSince: '30d' }, NOW)).toThrow(/later than/);
  });
});

describe('cursors', () => {
  const filters = { branch: 'main', statuses: ['failed'] };

  it('round-trips an offset for the same tool and filters', () => {
    const page = { limit: 20, offset: 0 };
    const cursor = nextCursor('list_runs', filters, page, 50)!;
    expect(readPage('list_runs', { statuses: ['failed'], branch: 'main' }, { cursor, limit: 20 })).toEqual({ limit: 20, offset: 20 });
  });

  it('is null on the last page', () => {
    expect(nextCursor('list_runs', filters, { limit: 20, offset: 40 }, 50)).toBeNull();
  });

  it('refuses a cursor from another tool, other filters, or garbage', () => {
    const cursor = nextCursor('list_runs', filters, { limit: 20, offset: 0 }, 50)!;
    expect(() => readPage('find_tests', filters, { cursor })).toThrow(/another tool/);
    expect(() => readPage('list_runs', { ...filters, branch: 'dev' }, { cursor })).toThrow(/different filters/);
    expect(() => readPage('list_runs', filters, { cursor: 'not-a-cursor' })).toThrow(ToolError);
  });
});

describe('references', () => {
  it('reads run references in every accepted form', () => {
    expect(parseRunRef(128)).toEqual({ kind: 'number', number: 128 });
    expect(parseRunRef('#128')).toEqual({ kind: 'number', number: 128 });
    expect(parseRunRef('latest')).toEqual({ kind: 'latest', failedOnly: false });
    expect(parseRunRef('latest-failed')).toEqual({ kind: 'latest', failedOnly: true });
    expect(parseRunRef('0f1e2d3c-4b5a-4968-8776-655443322110')).toEqual({ kind: 'id', id: '0f1e2d3c-4b5a-4968-8776-655443322110' });
    expect(parseRunRef('https://r.example.com/teams/acme/projects/web/runs/7?tab=specs')).toMatchObject({ kind: 'url', url: { runNumber: 7 } });
    expect(() => parseRunRef('yesterday')).toThrow(ToolError);
  });

  it('parses app URLs down to the entity', () => {
    const id = '0f1e2d3c-4b5a-4968-8776-655443322110';
    expect(parseAppUrl(`https://x/teams/acme/projects/web/runs/12/tests/${id}`)).toEqual({ teamSlug: 'acme', projectSlug: 'web', runNumber: 12, resultId: id });
    expect(parseAppUrl(`/teams/acme/projects/web/tests/${id}`)).toEqual({ teamSlug: 'acme', projectSlug: 'web', testId: id });
    expect(parseAppUrl('/teams/acme/projects/web/dashboard')).toEqual({ teamSlug: 'acme', projectSlug: 'web' });
    expect(parseAppUrl('acme/web')).toBeNull();
  });
});
