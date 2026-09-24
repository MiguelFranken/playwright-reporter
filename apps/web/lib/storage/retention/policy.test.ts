import { describe, expect, it } from 'vitest';
import { ingestSweepEnabled } from './config';
import { cutoffs, daysFor, environmentPolicy, expiresAt, normalizePolicy, policyFromForm, type RetentionPolicy } from './policy';

const DAY = 86_400_000;
const now = new Date('2026-09-24T12:00:00Z');
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

describe('environmentPolicy', () => {
  it('keeps everything until somebody opts in', () => {
    expect(environmentPolicy({})).toEqual({ policy: { enabled: false, days: 30, overrides: {} }, source: 'default' });
  });

  it('turns retention on from ARTIFACT_RETENTION_DAYS, clamped', () => {
    expect(environmentPolicy({ ARTIFACT_RETENTION_DAYS: '14' })).toEqual({ policy: { enabled: true, days: 14, overrides: {} }, source: 'environment' });
    expect(environmentPolicy({ ARTIFACT_RETENTION_DAYS: '99999' }).policy.days).toBe(3650);
  });

  it('ignores a value that is not a positive number', () => {
    for (const v of ['', 'abc', '0', '-3']) expect(environmentPolicy({ ARTIFACT_RETENTION_DAYS: v }).source).toBe('default');
  });
});

describe('normalizePolicy', () => {
  it('reads a stored policy back', () => {
    const p: RetentionPolicy = { enabled: true, days: 30, overrides: { video: 7, trace: 14 } };
    expect(normalizePolicy(p)).toEqual(p);
  });

  it('drops unknown kinds, nonsense days and overrides equal to the default', () => {
    expect(normalizePolicy({ enabled: true, days: 30, overrides: { video: 7, bogus: 3, trace: 'x', screenshot: 30 } })).toEqual({
      enabled: true,
      days: 30,
      overrides: { video: 7 },
    });
  });

  it('rejects a value without usable days, and treats anything but true as off', () => {
    expect(normalizePolicy(null)).toBeNull();
    expect(normalizePolicy({ enabled: true })).toBeNull();
    expect(normalizePolicy({ enabled: 'yes', days: 5 })?.enabled).toBe(false);
  });
});

describe('cutoffs', () => {
  it('groups kinds that share a lifetime, shortest first', () => {
    const groups = cutoffs({ enabled: true, days: 30, overrides: { video: 7, trace: 7, screenshot: 90 } }, now);
    expect(groups).toEqual([
      { before: new Date(now.getTime() - 7 * DAY), kinds: ['video', 'trace'] },
      { before: new Date(now.getTime() - 30 * DAY), kinds: ['image', 'text', 'other'] },
      { before: new Date(now.getTime() - 90 * DAY), kinds: ['screenshot'] },
    ]);
  });

  it('is one group when nothing is overridden', () => {
    expect(cutoffs({ enabled: true, days: 10, overrides: {} }, now)).toHaveLength(1);
  });
});

describe('expiresAt and daysFor', () => {
  const policy: RetentionPolicy = { enabled: true, days: 30, overrides: { video: 7 } };

  it('adds the kind’s lifetime to the upload time', () => {
    expect(daysFor(policy, 'video')).toBe(7);
    expect(daysFor(policy, 'trace')).toBe(30);
    expect(expiresAt(policy, 'video', now)).toEqual(new Date(now.getTime() + 7 * DAY));
  });

  it('is null while retention is off', () => {
    expect(expiresAt({ ...policy, enabled: false }, 'video', now)).toBeNull();
  });
});

describe('policyFromForm', () => {
  it('reads the switch, the default and the per-kind fields', () => {
    expect(policyFromForm(form({ enabled: 'on', days: '30', 'days.video': '7', 'days.trace': '', 'days.image': '30' }))).toEqual({
      enabled: true,
      days: 30,
      overrides: { video: 7 },
    });
    expect(policyFromForm(form({ enabled: 'off', days: '5' }))).toEqual({ enabled: false, days: 5, overrides: {} });
  });

  it.each([
    [{ days: '' }, /whole number of days/],
    [{ days: '0' }, /between 1 and 3650/],
    [{ days: '1.5' }, /whole number/],
    [{ days: '4000' }, /between 1 and 3650/],
    [{ days: '30', 'days.video': 'soon' }, /video lifetime/],
  ])('rejects %j', (fields, message) => {
    expect(policyFromForm(form(fields))).toMatch(message);
  });
});

describe('ingestSweepEnabled', () => {
  it('is on by default, so self-hosting needs no scheduler', () => {
    expect(ingestSweepEnabled({})).toBe(true);
  });

  it('can be switched off', () => {
    for (const v of ['off', 'false', '0', ' OFF ']) expect(ingestSweepEnabled({ ARTIFACT_RETENTION_INGEST_SWEEP: v })).toBe(false);
  });

  it('never runs on Vercel previews, which share production data', () => {
    expect(ingestSweepEnabled({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false);
    expect(ingestSweepEnabled({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe(true);
  });
});
