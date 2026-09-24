import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { reliabilityScore } from '@/lib/metrics/score';
import { andAll, isUuid, num, parsePage, parseRange, reliabilitySql, sinceDate, RANGE_OPTIONS } from './shared';

describe('parseRange', () => {
  it.each([
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
    ['7', 7],
    ['30', 30],
  ] as const)('accepts %s as %i days', (input, expected) => {
    expect(parseRange(input)).toBe(expected);
  });

  it.each(['', '0', '14', 'junk', '7days', '-7', undefined])('falls back for %p', (input) => {
    expect(parseRange(input)).toBe(30);
  });

  it('honours an explicit fallback', () => {
    expect(parseRange('nonsense', 7)).toBe(7);
    expect(parseRange(undefined, 90)).toBe(90);
  });

  it('only ever returns one of the offered options', () => {
    for (const input of ['7d', 'junk', '90', '1000']) {
      expect(RANGE_OPTIONS).toContain(parseRange(input));
    }
  });
});

describe('parsePage', () => {
  it.each([
    ['1', 1],
    ['2', 2],
    ['99', 99],
  ] as const)('accepts %s', (input, expected) => {
    expect(parsePage(input)).toBe(expected);
  });

  it.each(['0', '-1', '1.5', 'x', '', undefined])('falls back to page 1 for %p', (input) => {
    expect(parsePage(input)).toBe(1);
  });
});

describe('sinceDate', () => {
  it('returns an ISO string the given number of days back', () => {
    const before = Date.now();
    const iso = sinceDate(7);
    const after = Date.now();

    // Raw `sql` templates need a string, not a Date.
    expect(typeof iso).toBe('string');
    const ms = new Date(iso).getTime();
    expect(ms).toBeGreaterThanOrEqual(before - 7 * 86_400_000);
    expect(ms).toBeLessThanOrEqual(after - 7 * 86_400_000);
  });
});

describe('andAll', () => {
  it('is `true` when nothing is filtered', () => {
    expect(andAll([]).queryChunks).toEqual(sql`true`.queryChunks);
    expect(andAll([undefined, undefined]).queryChunks).toEqual(sql`true`.queryChunks);
  });

  it('drops the undefined parts and joins the rest with and', () => {
    const joined = andAll([sql`a = 1`, undefined, sql`b = 2`]);
    const rendered = JSON.stringify(joined.queryChunks);
    expect(rendered).toContain('a = 1');
    expect(rendered).toContain('b = 2');
    expect(rendered).toContain(' and ');
  });

  it('does not wrap a single condition in an and', () => {
    expect(JSON.stringify(andAll([sql`a = 1`]).queryChunks)).not.toContain(' and ');
  });
});

describe('isUuid', () => {
  it.each([
    '00000000-0000-4000-8000-000000000000',
    '0f8fad5b-d9cb-469f-a165-70867728950e',
    '0F8FAD5B-D9CB-469F-A165-70867728950E',
  ])('accepts %s', (value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each([
    '',
    'not-a-uuid',
    // A route param that would raise 22P02 in Postgres if it got that far.
    "1; drop table runs",
    '0f8fad5b-d9cb-469f-a165-70867728950',
    '0f8fad5bd9cb469fa16570867728950e',
    '0f8fad5b-d9cb-469f-a165-70867728950e-extra',
  ])('rejects %p', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});

describe('num', () => {
  it('parses the strings a Postgres count comes back as', () => {
    expect(num('42')).toBe(42);
    expect(num('0.5')).toBe(0.5);
    expect(num(7)).toBe(7);
  });

  it('is 0 for anything that is not a finite number', () => {
    for (const value of [null, undefined, '', 'abc', NaN, Infinity, {}]) expect(num(value)).toBe(0);
  });
});

describe('reliabilitySql', () => {
  const rendered = JSON.stringify(reliabilitySql(sql`ns`, sql`f`, sql`fl`).queryChunks);

  it('renders the same formula as reliabilityScore', () => {
    // 100 − failureRate·100 − flakyRate·50, clamped to 0…100 and rounded.
    expect(rendered).toContain('100 - (');
    expect(rendered).toContain(') * 100 - (');
    expect(rendered).toContain(') * 50');
    expect(rendered).toContain('greatest(0, least(100, round(');
    expect(reliabilityScore(0, 0)).toBe(100);
  });

  it('yields null rather than a score when nothing counted', () => {
    expect(rendered).toContain('= 0 then null');
  });

  it('casts the counts so the division is not integer division', () => {
    expect(rendered).toContain('::float');
  });
});
