import { describe, expect, it } from 'vitest';
import { attemptSignature, attemptVerdict, type AttemptLike } from './attempt-verdict';

const step = (title: string, depth: number, error?: string) => ({ title, category: 'pw:api', durationMs: 10, depth, startedAt: '2026-01-01T00:00:00Z', error });
const failed = (retry: number, message: string, stepTitle = 'click Buy', line = 10): AttemptLike => ({
  retry,
  status: 'failed',
  errors: [{ message, location: { file: 'tests/a.spec.ts', line, column: 1 } }],
  steps: [step('Test body', 0), step(stepTitle, 1, message)],
});
const passed = (retry: number): AttemptLike => ({ retry, status: 'passed', errors: [], steps: [] });

describe('attemptVerdict', () => {
  it('calls a test that passed on retry flaky', () => {
    expect(attemptVerdict([failed(0, 'Timeout 5000ms exceeded'), passed(1)]).verdict).toBe('flaky');
  });

  it('calls identical failures on every attempt deterministic, ignoring volatile numbers', () => {
    const r = attemptVerdict([failed(0, 'Timeout 5000ms exceeded'), failed(1, 'Timeout 5123ms exceeded')]);
    expect(r.verdict).toBe('deterministic');
    expect(r.reason).toContain('all 2 attempts');
  });

  it('is inconclusive when attempts failed at different places', () => {
    expect(attemptVerdict([failed(0, 'Timeout exceeded', 'click Buy'), failed(1, 'Timeout exceeded', 'fill email')]).verdict).toBe('inconclusive');
    expect(attemptVerdict([failed(0, 'Timeout exceeded', 'click', 10), failed(1, 'Timeout exceeded', 'click', 42)]).verdict).toBe('inconclusive');
  });

  it('is inconclusive with a single attempt, and has no verdict without a failure', () => {
    expect(attemptVerdict([failed(0, 'boom')]).reason).toContain('Only one attempt');
    expect(attemptVerdict([passed(0)]).verdict).toBeNull();
  });

  it('gives passing attempts no signature', () => {
    expect(attemptSignature(passed(0))).toBeNull();
    expect(attemptSignature(failed(0, 'x'))).toMatch(/^[0-9a-f]{12}$/);
  });
});
