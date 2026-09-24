/**
 * "Since when, and after which commit": walks a test's history on one branch
 * back from a failing execution to the last time it passed. Reframes "why
 * does this fail" as "what changed between these two runs".
 */
export interface HistoryPoint {
  resultId: string;
  runNumber: number;
  startedAt: Date;
  outcome: string;
  sha: string | null;
  shortSha: string | null;
  author: string | null;
  message: string | null;
}

export type RegressionKind = 'regressed' | 'never_passed' | 'new_test' | 'not_failing';

export interface RegressionWindow {
  kind: RegressionKind;
  lastPass: HistoryPoint | null;
  firstFail: HistoryPoint | null;
  /** Failing executions in the current streak, the target included. */
  failingRuns: number;
}

const isFail = (o: string) => o === 'failed' || o === 'timedout';

/**
 * `history` is newest first and may start before or at the target; the walk
 * starts at the target execution. `firstSeenAt` tells a brand-new test from
 * one that simply has no pass in the window.
 */
export function regressionWindow(history: HistoryPoint[], targetResultId: string, firstSeenAt: Date): RegressionWindow {
  const start = history.findIndex((h) => h.resultId === targetResultId);
  const target = history[start];
  if (!target || !isFail(target.outcome)) return { kind: 'not_failing', lastPass: null, firstFail: null, failingRuns: 0 };
  let i = start;
  // Skipped and interrupted executions neither break nor extend the streak.
  let firstFail = target;
  let failingRuns = 0;
  for (; i < history.length; i++) {
    const h = history[i];
    if (isFail(h.outcome)) {
      firstFail = h;
      failingRuns++;
    } else if (h.outcome === 'passed' || h.outcome === 'flaky') {
      return { kind: 'regressed', lastPass: h, firstFail, failingRuns };
    }
  }
  const isNew = firstFail.startedAt.getTime() - firstSeenAt.getTime() < 60_000 * 60;
  return { kind: isNew ? 'new_test' : 'never_passed', lastPass: null, firstFail, failingRuns };
}
