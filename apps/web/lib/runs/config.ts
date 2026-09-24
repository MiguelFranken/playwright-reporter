/**
 * How long a run may go without hearing from its reporter before it counts as
 * stale. A reporter sends a heartbeat every 30 seconds while tests run, so
 * the default tolerates several lost beats; a reporter too old to send them
 * is revived by its next event if a long test outlasts the timeout.
 */
export const DEFAULT_STALE_TIMEOUT_MS = 5 * 60 * 1000;
export const MIN_STALE_TIMEOUT_MS = 60 * 1000;
export const MAX_STALE_TIMEOUT_MS = 60 * 60 * 1000;

function clamp(ms: number) {
  return Math.min(MAX_STALE_TIMEOUT_MS, Math.max(MIN_STALE_TIMEOUT_MS, Math.round(ms)));
}

function parse(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** `RUN_STALE_TIMEOUT_MS`, clamped to 1–60 minutes. */
export function defaultStaleTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const ms = parse(env.RUN_STALE_TIMEOUT_MS);
  return ms === undefined ? DEFAULT_STALE_TIMEOUT_MS : clamp(ms);
}

/** A project's `settings.staleTimeoutMs`, else the deployment's default. */
export function projectStaleTimeoutMs(
  project: { settings: Record<string, unknown> | null },
  env?: Record<string, string | undefined>,
): number {
  const ms = parse(project.settings?.staleTimeoutMs);
  return ms === undefined ? defaultStaleTimeoutMs(env) : clamp(ms);
}
