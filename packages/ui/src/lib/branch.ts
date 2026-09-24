/**
 * What a branch-shaped row shows for runs the reporter sent without a branch
 * (a detached checkout, a local run outside git). They still group together,
 * but there is no branch to open, so the row names the absence instead.
 */
export const NO_BRANCH_LABEL = 'No branch';

/** Colour for a run pass rate: green from 90%, amber from 60%, red below. */
export function passRateClass(rate: number | null) {
  if (rate === null) return 'text-muted-foreground';
  if (rate >= 0.9) return 'text-success-text';
  if (rate >= 0.6) return 'text-warning-text';
  return 'text-danger-text';
}
