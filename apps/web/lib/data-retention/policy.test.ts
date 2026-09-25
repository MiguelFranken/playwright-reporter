import { describe, expect, it } from 'vitest';
import { ingestSweepEnabled } from './config';
import { DEFAULT_POLICY, cutoffs, environmentPolicy, fillDays, normalizePolicy, policyFromForm, type DataRetentionPolicy } from './policy';

const DAY = 86_400_000;
const now = new Date('2026-09-24T12:00:00Z');
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}
const valid = { enabled: 'on', runDays: '90', keepLatestRuns: '20', eventDays: '7', auditDays: '', housekeeping: 'on' };

describe('environmentPolicy', () => {
  it('keeps everything until somebody opts in', () => {
    expect(environmentPolicy({})).toEqual({ policy: DEFAULT_POLICY, source: 'default' });
    expect(DEFAULT_POLICY.enabled).toBe(false);
  });

  it('turns retention on from DATA_RETENTION_DAYS, clamped', () => {
    expect(environmentPolicy({ DATA_RETENTION_DAYS: '30' })).toEqual({ policy: { ...DEFAULT_POLICY, enabled: true, runDays: 30 }, source: 'environment' });
    expect(environmentPolicy({ DATA_RETENTION_DAYS: '99999' }).policy.runDays).toBe(3650);
  });

  it('ignores a value that is not a positive number', () => {
    for (const v of ['', 'abc', '0', '-3']) expect(environmentPolicy({ DATA_RETENTION_DAYS: v }).source).toBe('default');
  });
});

describe('normalizePolicy', () => {
  it('reads a stored policy back', () => {
    const p: DataRetentionPolicy = { enabled: true, runDays: 30, keepLatestRuns: 5, eventDays: 3, auditDays: 365, housekeeping: false };
    expect(normalizePolicy(p)).toEqual(p);
  });

  it('fills what is missing with the defaults and drops nonsense', () => {
    expect(normalizePolicy({ enabled: true, runDays: 30, keepLatestRuns: -1, eventDays: 'x', auditDays: 0 })).toEqual({
      ...DEFAULT_POLICY,
      enabled: true,
      runDays: 30,
    });
  });

  it('keeps no-latest-runs as zero, not as the default', () => {
    expect(normalizePolicy({ runDays: 30, keepLatestRuns: 0 })?.keepLatestRuns).toBe(0);
  });

  it('refuses a value without a run lifetime', () => {
    for (const v of [null, 'x', {}, { runDays: 0 }]) expect(normalizePolicy(v)).toBeNull();
  });
});

describe('cutoffs', () => {
  it('counts each lifetime back from now', () => {
    const c = cutoffs({ ...DEFAULT_POLICY, runDays: 30, eventDays: 7, auditDays: 365 }, now);
    expect(c.runs).toEqual(new Date(now.getTime() - 30 * DAY));
    expect(c.events).toEqual(new Date(now.getTime() - 7 * DAY));
    expect(c.audit).toEqual(new Date(now.getTime() - 365 * DAY));
  });

  it('never keeps an event log longer than its run, and keeps the audit log when told to', () => {
    const c = cutoffs({ ...DEFAULT_POLICY, runDays: 3, eventDays: 30, auditDays: null }, now);
    expect(c.events).toEqual(c.runs);
    expect(c.audit).toBeNull();
  });
});

describe('policyFromForm', () => {
  it('reads every field', () => {
    expect(policyFromForm(form({ ...valid, auditDays: '400' }))).toEqual({
      enabled: true,
      runDays: 90,
      keepLatestRuns: 20,
      eventDays: 7,
      auditDays: 400,
      housekeeping: true,
    });
  });

  it('reads unchecked boxes as off and a blank audit lifetime as forever', () => {
    const { enabled: _e, housekeeping: _h, ...rest } = valid;
    expect(policyFromForm(form(rest))).toMatchObject({ enabled: false, housekeeping: false, auditDays: null });
  });

  it('explains what is wrong', () => {
    expect(policyFromForm(form({ ...valid, runDays: '0' }))).toMatch(/Keep runs .* between 1 and 3650/);
    expect(policyFromForm(form({ ...valid, keepLatestRuns: '-1' }))).toMatch(/latest 0 to 10,000/);
    expect(policyFromForm(form({ ...valid, eventDays: '1.5' }))).toMatch(/live events/);
    expect(policyFromForm(form({ ...valid, auditDays: 'never' }))).toMatch(/audit log/);
  });
});

describe('fillDays', () => {
  it('fills the window oldest first with zero days, ending today', () => {
    const rows = fillDays([{ day: '2026-09-23', runs: 2, results: 10, attempts: 12, artifactBytes: 5 }], 3, now);
    expect(rows.map((r) => r.day)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24']);
    expect(rows[0]).toEqual({ day: '2026-09-22', runs: 0, results: 0, attempts: 0, artifactBytes: 0 });
    expect(rows[1].results).toBe(10);
  });
});

describe('ingestSweepEnabled', () => {
  it('is on by default and off when switched off or on a Vercel preview', () => {
    expect(ingestSweepEnabled({})).toBe(true);
    expect(ingestSweepEnabled({ DATA_RETENTION_INGEST_SWEEP: 'off' })).toBe(false);
    expect(ingestSweepEnabled({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false);
    expect(ingestSweepEnabled({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe(true);
  });
});
