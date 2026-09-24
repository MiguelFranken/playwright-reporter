/**
 * What changed between two runs, test by test. The buckets follow a fixed
 * table (base outcome × head outcome) so the answer is reproducible.
 */
export interface DiffRow {
  testId: string;
  title: string;
  file: string;
  browser: string;
  baseOutcome: string | null;
  headOutcome: string | null;
  baseSignature: string | null;
  headSignature: string | null;
  baseMs: number | null;
  headMs: number | null;
  headResultId: string | null;
  headError: string | null;
}

export type Bucket = 'newFailure' | 'fixed' | 'newFlaky' | 'stillFailing' | 'added' | 'removed' | 'unchanged';

const isFail = (o: string | null) => o === 'failed' || o === 'timedout';

export function bucketOf(row: Pick<DiffRow, 'baseOutcome' | 'headOutcome'>): Bucket[] {
  const { baseOutcome: b, headOutcome: h } = row;
  if (b === null && h === null) return ['unchanged'];
  if (b === null) return isFail(h) ? ['added', 'newFailure'] : ['added'];
  if (h === null) return ['removed'];
  if (isFail(h)) return isFail(b) ? ['stillFailing'] : ['newFailure'];
  if (isFail(b)) return ['fixed'];
  if (h === 'flaky' && b === 'passed') return ['newFlaky'];
  return ['unchanged'];
}

export const SLOWER_RATIO = 1.5;
export const SLOWER_MIN_DELTA_MS = 1_000;

export function isSlower(row: Pick<DiffRow, 'baseOutcome' | 'headOutcome' | 'baseMs' | 'headMs'>): boolean {
  if (row.baseOutcome !== 'passed' || row.headOutcome !== 'passed' || !row.baseMs || !row.headMs) return false;
  return row.headMs / row.baseMs >= SLOWER_RATIO && row.headMs - row.baseMs >= SLOWER_MIN_DELTA_MS;
}

export function diffRuns(rows: DiffRow[]) {
  const buckets: Record<Exclude<Bucket, 'unchanged'>, DiffRow[]> & { slower: DiffRow[]; unchanged: DiffRow[] } = {
    newFailure: [],
    fixed: [],
    newFlaky: [],
    stillFailing: [],
    added: [],
    removed: [],
    slower: [],
    unchanged: [],
  };
  for (const row of rows) {
    for (const bucket of bucketOf(row)) buckets[bucket].push(row);
    if (isSlower(row)) buckets.slower.push(row);
  }
  buckets.slower.sort((a, b) => b.headMs! / b.baseMs! - a.headMs! / a.baseMs!);
  return buckets;
}
