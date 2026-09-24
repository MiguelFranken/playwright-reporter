import type { Grade } from './tone';

/**
 * Turning a reliability score into words and a colour is presentation, so it
 * lives here. Computing the score — and its SQL twin — stays in the app, next
 * to the query that has to agree with it.
 */
export function reliabilityLabel(score: number | null | undefined): { label: string; tone: Grade } {
  if (score === null || score === undefined) return { label: 'No data', tone: 'muted' };
  if (score >= 80) return { label: 'Healthy', tone: 'good' };
  if (score >= 50) return { label: 'Shaky', tone: 'warn' };
  return { label: 'Unreliable', tone: 'bad' };
}

export function flakyLabel(rate: number): { label: string; tone: Grade } {
  if (rate >= 0.3) return { label: 'Unstable', tone: 'bad' };
  if (rate >= 0.1) return { label: 'Unreliable', tone: 'warn' };
  return { label: 'Occasional', tone: 'good' };
}
