import { describe, expect, it } from 'vitest';
import { watchdogDriver } from './index';

describe('watchdogDriver', () => {
  it('follows RUN_WATCHDOG_DRIVER when it names a driver', () => {
    expect(watchdogDriver({ RUN_WATCHDOG_DRIVER: 'none', VERCEL: '1', VERCEL_ENV: 'production' })).toBe('none');
    expect(watchdogDriver({ RUN_WATCHDOG_DRIVER: 'workflow', VERCEL: '1', VERCEL_ENV: 'preview' })).toBe('workflow');
  });

  it('guards production on Vercel, but not previews that share its database', () => {
    expect(watchdogDriver({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe('workflow');
    expect(watchdogDriver({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe('none');
  });

  it('guards runs off Vercel (local world in dev, Postgres world self-hosted)', () => {
    expect(watchdogDriver({})).toBe('workflow');
    expect(watchdogDriver({ RUN_WATCHDOG_DRIVER: 'bogus' })).toBe('workflow');
  });
});
