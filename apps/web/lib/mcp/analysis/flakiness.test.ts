import { describe, expect, it } from 'vitest';
import { flakinessVerdict, flipRate, type Execution } from './flakiness';

let t = 0;
const ex = (outcome: string, signature: string | null = outcome === 'failed' ? 'sig-a' : null): Execution => ({ outcome, signature, startedAt: new Date(2026, 0, 1, 0, t++) });
/** Oldest first. */
const seq = (...outcomes: string[]) => outcomes.map((o) => ex(o));

describe('flakinessVerdict', () => {
  it('needs at least three executions', () => {
    expect(flakinessVerdict(seq('failed', 'passed'), []).verdict).toBe('insufficient_data');
  });

  it('calls two retry-passes flaky', () => {
    expect(flakinessVerdict(seq('passed', 'flaky', 'passed', 'flaky'), []).verdict).toBe('flaky');
  });

  it('calls a same-commit conflict flaky even without retries', () => {
    const r = flakinessVerdict(seq('passed', 'failed', 'passed'), [{ sha: 'abc', passed: 1, failed: 1, flaky: 0, runNumbers: [1, 2] }]);
    expect(r.verdict).toBe('flaky');
    expect(r.reason).toContain('same commit');
  });

  it('calls one retry-pass plus frequent flips flaky', () => {
    expect(flakinessVerdict(seq('passed', 'failed', 'passed', 'failed', 'flaky'), []).verdict).toBe('flaky');
  });

  it('calls three identical failures in a row consistently failing', () => {
    const r = flakinessVerdict(seq('passed', 'passed', 'failed', 'failed', 'failed'), []);
    expect(r.verdict).toBe('consistently_failing');
    expect(r.reason).toContain('last 3');
  });

  it('does not call failures with different errors consistently failing', () => {
    const list = [ex('passed'), ex('failed', 'a'), ex('failed', 'b'), ex('failed', 'c')];
    expect(flakinessVerdict(list, []).verdict).toBe('intermittent');
  });

  it('calls all passes stable and anything else intermittent', () => {
    expect(flakinessVerdict(seq('passed', 'passed', 'passed'), []).verdict).toBe('stable');
    expect(flakinessVerdict(seq('passed', 'failed', 'passed', 'passed'), []).verdict).toBe('intermittent');
  });

  it('grows confidence with evidence', () => {
    expect(flakinessVerdict(seq('passed', 'passed', 'passed'), []).confidence).toBe('low');
    expect(flakinessVerdict(seq(...Array(6).fill('passed')), []).confidence).toBe('medium');
    expect(flakinessVerdict(seq(...Array(10).fill('passed')), []).confidence).toBe('high');
  });
});

describe('flipRate', () => {
  it('counts pass/fail transitions and ignores flaky and skipped', () => {
    expect(flipRate(seq('passed', 'failed', 'passed', 'failed'))).toBe(1);
    expect(flipRate(seq('passed', 'flaky', 'skipped', 'passed'))).toBe(0);
  });
});
