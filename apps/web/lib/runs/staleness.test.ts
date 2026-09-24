import { describe, expect, it } from 'vitest';
import { effectiveStatus, isStale, staleDeadline } from './staleness';

const at = new Date('2026-09-24T10:00:00.000Z');
const run = (over: Partial<{ status: 'running' | 'passed' | 'incomplete'; lastEventAt: Date; staleAfterMs: number }> = {}) => ({
  status: 'running' as const,
  lastEventAt: at,
  staleAfterMs: 300_000,
  ...over,
});
const later = (ms: number) => new Date(at.getTime() + ms);

describe('staleness', () => {
  it('puts the deadline one timeout after the last event', () => {
    expect(staleDeadline(run())).toEqual(later(300_000));
  });

  it('turns a silent running run stale at its deadline, not before', () => {
    expect(isStale(run(), later(299_999))).toBe(false);
    expect(isStale(run(), later(300_000))).toBe(true);
    expect(effectiveStatus(run(), later(299_999))).toBe('running');
    expect(effectiveStatus(run(), later(300_000))).toBe('incomplete');
  });

  it('never touches a run that already ended', () => {
    expect(isStale(run({ status: 'passed' }), later(10 * 3_600_000))).toBe(false);
    expect(effectiveStatus(run({ status: 'passed' }), later(10 * 3_600_000))).toBe('passed');
  });

  it("uses the run's own timeout", () => {
    expect(isStale(run({ staleAfterMs: 60_000 }), later(60_000))).toBe(true);
  });
});
