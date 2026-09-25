import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, formatDateTime, formatDuration, formatPercent, formatRelative, shortSha } from './format';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatDuration', () => {
  it.each([
    [0, '0ms'],
    [1, '1ms'],
    [999, '999ms'],
    [999.6, '1000ms'],
    [1000, '1.0s'],
    [1500, '1.5s'],
    [9949, '9.9s'],
    [10_000, '10s'],
    [59_000, '59s'],
    [60_000, '1m 0s'],
    [90_000, '1m 30s'],
    [3_599_000, '59m 59s'],
    [3_600_000, '1h 0m'],
    [7_830_000, '2h 10m'],
  ] as const)('renders %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('shows a dash when there is no duration', () => {
    expect(formatDuration(null)).toBe('–');
    expect(formatDuration(undefined)).toBe('–');
  });
});

describe('formatPercent', () => {
  it.each([
    [0, 0, '0%'],
    [1, 0, '100%'],
    [0.5, 0, '50%'],
    [0.1234, 1, '12.3%'],
    [0.1234, 2, '12.34%'],
  ] as const)('renders %f with %i digits as %s', (value, digits, expected) => {
    expect(formatPercent(value, digits)).toBe(expected);
  });

  it('shows a dash for nothing and for NaN', () => {
    expect(formatPercent(null)).toBe('–');
    expect(formatPercent(undefined)).toBe('–');
    expect(formatPercent(NaN)).toBe('–');
  });
});

describe('formatBytes', () => {
  it.each([
    [1, '1 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [1024 ** 3, '1.0 GB'],
    [12.9 * 1024 ** 3, '12.9 GB'],
  ] as const)('renders %i as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('shows a dash for nothing and for zero', () => {
    expect(formatBytes(null)).toBe('–');
    expect(formatBytes(undefined)).toBe('–');
    expect(formatBytes(0)).toBe('–');
  });
});

describe('shortSha', () => {
  it('takes the first seven characters', () => {
    expect(shortSha('0123456789abcdef')).toBe('0123456');
  });

  it('is empty when there is no sha', () => {
    expect(shortSha(null)).toBe('');
    expect(shortSha(undefined)).toBe('');
    expect(shortSha('')).toBe('');
  });
});

describe('formatRelative', () => {
  it('describes a past moment relative to now', () => {
    vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00.000Z') });
    expect(formatRelative(new Date('2026-09-17T11:58:00.000Z'))).toBe('2 minutes ago');
    expect(formatRelative('2026-09-16T12:00:00.000Z')).toBe('1 day ago');
  });

  it('shows a dash without a date', () => {
    expect(formatRelative(null)).toBe('–');
    expect(formatRelative(undefined)).toBe('–');
  });
});

describe('formatDateTime', () => {
  it('accepts a Date and an ISO string alike', () => {
    const iso = '2026-09-17T12:00:00.000Z';
    expect(formatDateTime(iso)).toBe(formatDateTime(new Date(iso)));
    expect(formatDateTime(iso)).toMatch(/2026/);
  });

  it('shows a dash without a date', () => {
    expect(formatDateTime(null)).toBe('–');
    expect(formatDateTime(undefined)).toBe('–');
  });
});
