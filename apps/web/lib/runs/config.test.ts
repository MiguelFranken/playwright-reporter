import { describe, expect, it } from 'vitest';
import { DEFAULT_STALE_TIMEOUT_MS, defaultStaleTimeoutMs, projectStaleTimeoutMs } from './config';

describe('defaultStaleTimeoutMs', () => {
  it('is five minutes unless configured', () => {
    expect(defaultStaleTimeoutMs({})).toBe(DEFAULT_STALE_TIMEOUT_MS);
    expect(DEFAULT_STALE_TIMEOUT_MS).toBe(5 * 60 * 1000);
    expect(defaultStaleTimeoutMs({ RUN_STALE_TIMEOUT_MS: '600000' })).toBe(600_000);
  });

  it('clamps to one minute … one hour', () => {
    expect(defaultStaleTimeoutMs({ RUN_STALE_TIMEOUT_MS: '1000' })).toBe(60_000);
    expect(defaultStaleTimeoutMs({ RUN_STALE_TIMEOUT_MS: String(24 * 3_600_000) })).toBe(3_600_000);
  });

  it('ignores what is not a positive number', () => {
    for (const value of ['', 'soon', '-5', '0', 'NaN']) {
      expect(defaultStaleTimeoutMs({ RUN_STALE_TIMEOUT_MS: value })).toBe(DEFAULT_STALE_TIMEOUT_MS);
    }
  });
});

describe('projectStaleTimeoutMs', () => {
  it("prefers the project's setting, clamped", () => {
    expect(projectStaleTimeoutMs({ settings: { staleTimeoutMs: 120_000 } }, {})).toBe(120_000);
    expect(projectStaleTimeoutMs({ settings: { staleTimeoutMs: 5 } }, {})).toBe(60_000);
  });

  it('falls back to the deployment default', () => {
    expect(projectStaleTimeoutMs({ settings: {} }, { RUN_STALE_TIMEOUT_MS: '600000' })).toBe(600_000);
    expect(projectStaleTimeoutMs({ settings: { staleTimeoutMs: 'x' } }, {})).toBe(DEFAULT_STALE_TIMEOUT_MS);
  });
});
