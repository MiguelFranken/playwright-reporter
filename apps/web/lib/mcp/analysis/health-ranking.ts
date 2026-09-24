/**
 * "What should we fix first": tests ranked by how many runs they broke in the
 * window. A failure counts fully and a flake half — a flake still costs a
 * retry and trust, but it did not turn the run red. Ties go to chronic tests,
 * then to the one that failed most recently.
 */
import { CHRONIC_FAILURE_RATE, CHRONIC_MIN_RUNS, CHRONIC_STREAK } from '@/lib/metrics/score';

export interface HealthCandidate {
  testId: string;
  title: string;
  file: string;
  browser: string;
  runs: number;
  failed: number;
  flaky: number;
  failureRate: number;
  streak: number;
  lastOutcome: string;
  lastRunAt: Date;
  lastRunNumber: number;
}

export type Ranked<T extends HealthCandidate = HealthCandidate> = T & {
  rank: number;
  impact: number;
  chronic: boolean;
  reason: string;
};

export function isChronic(c: Pick<HealthCandidate, 'streak' | 'runs' | 'failureRate'>): boolean {
  return c.streak >= CHRONIC_STREAK || (c.runs >= CHRONIC_MIN_RUNS && c.failureRate >= CHRONIC_FAILURE_RATE);
}

export function rankFixFirst<T extends HealthCandidate>(candidates: T[], limit = 5): Ranked<T>[] {
  return candidates
    .map((c) => ({ ...c, impact: c.failed + 0.5 * c.flaky, chronic: isChronic(c) }))
    .filter((c) => c.impact > 0)
    .sort((a, b) => b.impact - a.impact || Number(b.chronic) - Number(a.chronic) || b.lastRunAt.getTime() - a.lastRunAt.getTime())
    .slice(0, limit)
    .map((c, i) => ({ ...c, rank: i + 1, reason: reasonFor(c) }));
}

export function reasonFor(c: HealthCandidate & { chronic: boolean }): string {
  const failing = c.lastOutcome === 'failed' || c.lastOutcome === 'timedout';
  const parts: string[] = [];
  if (c.failed) parts.push(`failed ${c.failed} of ${c.runs} runs`);
  if (c.flaky) parts.push(`flaky in ${c.flaky}`);
  if (c.chronic) parts.push(failing && c.streak > 1 ? `chronic: ${c.streak} failures in a row, still failing` : 'chronic');
  else if (failing) parts.push(`failing in the latest run (#${c.lastRunNumber})`);
  return parts.join(', ');
}
