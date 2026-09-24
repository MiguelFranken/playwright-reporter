/**
 * `workflow` guards each running run with a durable Workflow SDK timer (on
 * Vercel, or self-hosted on the Postgres world). `none` records nothing: runs
 * still read as `incomplete` once stale (see `lib/runs/staleness`), they just
 * are not written down or announced to the live views.
 */
export type WatchdogDriver = 'workflow' | 'none';

export interface RunWatchdog {
  readonly name: WatchdogDriver;
  /** Guards a running run, unless something already does. Idempotent. */
  arm(runId: string): Promise<void>;
  /** Stops the watchdog of a run that finished. Best effort. */
  disarm(watchdogId: string): Promise<void>;
}

/**
 * What an ingest call asks of the watchdog once its response is sent: guard
 * a run that is running without one, or stop the one guarding a run that has
 * finished. The routes act on it; it is not part of the response.
 */
export interface WatchdogEffect {
  arm?: string;
  disarm?: string;
}
