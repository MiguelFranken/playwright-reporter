/**
 * The pure parts of the ingest service. Everything else in this module needs a
 * database and lives in `test/integration/ingest-*.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { AttemptEndEvent } from '@miguelfranken/protocol';
import { clampDuration, finalOutcome, runUrl } from './service';

const attempt = (overrides: Partial<AttemptEndEvent>): AttemptEndEvent =>
  ({ status: 'passed', outcome: 'expected', ...overrides }) as AttemptEndEvent;

describe('finalOutcome', () => {
  it.each([
    { status: 'skipped', outcome: 'expected', expected: 'skipped' },
    { status: 'passed', outcome: 'skipped', expected: 'skipped' },
    // A skip wins over everything else, from either side.
    { status: 'failed', outcome: 'skipped', expected: 'skipped' },
    { status: 'skipped', outcome: 'flaky', expected: 'skipped' },
  ] as const)('maps status=$status outcome=$outcome to skipped', ({ status, outcome, expected }) => {
    expect(finalOutcome(attempt({ status, outcome }))).toBe(expected);
  });

  it.each([
    { status: 'passed', outcome: 'flaky', expected: 'flaky' },
    { status: 'failed', outcome: 'flaky', expected: 'flaky' },
    { status: 'passed', outcome: 'expected', expected: 'passed' },
    { status: 'failed', outcome: 'expected', expected: 'passed' },
    { status: 'timedOut', outcome: 'unexpected', expected: 'timedout' },
    { status: 'interrupted', outcome: 'unexpected', expected: 'interrupted' },
    { status: 'failed', outcome: 'unexpected', expected: 'failed' },
    // A test that was expected to fail but passed is still unexpected.
    { status: 'passed', outcome: 'unexpected', expected: 'failed' },
  ] as const)('maps status=$status outcome=$outcome to $expected', ({ status, outcome, expected }) => {
    expect(finalOutcome(attempt({ status, outcome }))).toBe(expected);
  });

  it("lets Playwright's outcome override the last attempt's status", () => {
    // The precedence is skipped → flaky → expected → the raw status.
    expect(finalOutcome(attempt({ status: 'timedOut', outcome: 'flaky' }))).toBe('flaky');
    expect(finalOutcome(attempt({ status: 'timedOut', outcome: 'expected' }))).toBe('passed');
  });
});

describe('clampDuration', () => {
  it('rounds an ordinary duration', () => {
    expect(clampDuration(1234.4)).toBe(1234);
    expect(clampDuration(1234.6)).toBe(1235);
    expect(clampDuration(0)).toBe(0);
  });

  it('never exceeds what an integer column can hold', () => {
    expect(clampDuration(2_147_483_647)).toBe(2_147_483_647);
    expect(clampDuration(2_147_483_648)).toBe(2_147_483_647);
    // 40 days: a run left open, or a reporter with a skewed clock.
    expect(clampDuration(40 * 24 * 60 * 60 * 1000)).toBe(2_147_483_647);
  });

  it('never goes negative, so a future start time is harmless', () => {
    expect(clampDuration(-1)).toBe(0);
    expect(clampDuration(-1e12)).toBe(0);
  });

  it('turns a non-number into zero rather than a failed insert', () => {
    expect(clampDuration(NaN)).toBe(0);
    expect(clampDuration(Infinity)).toBe(0);
    expect(clampDuration(-Infinity)).toBe(0);
  });
});

describe('runUrl', () => {
  it('points at the run page for the token’s team and project', () => {
    process.env.BASE_URL = 'https://reports.example.test';
    const project = { teamSlug: 'acme', slug: 'web' } as Parameters<typeof runUrl>[0];
    expect(runUrl(project, 12)).toBe('https://reports.example.test/teams/acme/projects/web/runs/12');
  });
});
