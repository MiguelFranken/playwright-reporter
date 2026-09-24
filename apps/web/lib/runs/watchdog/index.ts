import { after } from 'next/server';
import type { RunWatchdog, WatchdogDriver, WatchdogEffect } from './types';
import { WorkflowRunWatchdog } from './workflow';

export type { RunWatchdog, WatchdogDriver, WatchdogEffect } from './types';

/**
 * `RUN_WATCHDOG_DRIVER`, else by environment. Vercel previews default to
 * `none`: they share the production database, and a watchdog started from a
 * preview would run preview code against production rows.
 */
export function watchdogDriver(env: Record<string, string | undefined> = process.env): WatchdogDriver {
  const d = env.RUN_WATCHDOG_DRIVER;
  if (d === 'workflow' || d === 'none') return d;
  if (env.VERCEL) return env.VERCEL_ENV === 'production' ? 'workflow' : 'none';
  return 'workflow';
}

const noWatchdog: RunWatchdog = {
  name: 'none',
  arm: async () => undefined,
  disarm: async () => undefined,
};

let cached: RunWatchdog | undefined;

export function getWatchdog(): RunWatchdog {
  if (cached) return cached;
  cached = watchdogDriver() === 'workflow' ? new WorkflowRunWatchdog() : noWatchdog;
  return cached;
}

/**
 * Acts on an ingest call's watchdog effect once the response is sent, so a
 * reporter never waits on it and a failure never fails its request: the next
 * heartbeat asks again.
 */
export function afterIngest(effect: WatchdogEffect) {
  if (!effect.arm && !effect.disarm) return;
  const watchdog = getWatchdog();
  if (watchdog.name === 'none') return;
  after(async () => {
    try {
      if (effect.disarm) await watchdog.disarm(effect.disarm);
      if (effect.arm) await watchdog.arm(effect.arm);
    } catch (err) {
      console.error('[watchdog] failed', err);
    }
  });
}
