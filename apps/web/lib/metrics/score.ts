/**
 * Provisional reliability score (0–100): failures weigh fully, flakiness half.
 * Kept in one place so the UI and SQL stay consistent (see `reliabilitySql`).
 */
export function reliabilityScore(failureRate: number, flakyRate: number): number {
  const score = 100 - failureRate * 100 - flakyRate * 50;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Label + tone is presentation and lives in the design system; re-exported
// here so the existing call sites keep working.
export { flakyLabel, reliabilityLabel } from '@miguelfranken/ui/lib/reliability';

export const CHRONIC_STREAK = 5;
export const CHRONIC_FAILURE_RATE = 0.7;
export const CHRONIC_MIN_RUNS = 5;
