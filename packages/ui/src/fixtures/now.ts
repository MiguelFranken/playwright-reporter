/**
 * The instant every fixture is expressed relative to. Stories pass it to
 * `formatRelative` so "3 hours ago" is the same string in every run, in every
 * timezone, forever — otherwise assertions and screenshots drift by the day.
 */
export const NOW = new Date('2026-09-18T09:00:00Z');

/** Convenience: `ago(90)` is 90 minutes before NOW. */
export function ago(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}
