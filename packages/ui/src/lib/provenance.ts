/**
 * What a run actually exercised: whether the checkout had uncommitted changes,
 * how its executor was decided, and whether its artifacts all arrived. Read by
 * the run header and by the MCP tools, so both say the same thing.
 *
 * Unknown stays unknown: a run from an older reporter carries none of these
 * fields, and the wording never guesses a value for it.
 */

/** How the reporter decided `ci` or `local`; mirrors the protocol's `ci.detectedBy`. */
export type ExecutorSource = 'provider' | 'ci-env' | 'option';

export interface RunProvenance {
  executor: string;
  ciProvider: string | null;
  executorDetectedBy?: ExecutorSource | null;
  /** Uncommitted changes to tracked files when the run started; null when unknown. */
  dirty?: boolean | null;
  dirtyFiles?: number | null;
}

/**
 * Whether the run is labelled CI only because a `CI` variable was set, with no
 * known provider behind it (a local wrapper script may set it). Runs from before
 * `detectedBy` existed had `provider: 'unknown'` for exactly that case.
 */
export function isCiFlagOnly(p: RunProvenance): boolean {
  if (p.executor !== 'ci') return false;
  if (p.executorDetectedBy) return p.executorDetectedBy === 'ci-env';
  return p.ciProvider === 'unknown';
}

const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

/** "Uncommitted changes (3 files)", or null when the tree was clean or its state is unknown. */
export function uncommittedLabel(p: RunProvenance): string | null {
  if (!p.dirty) return null;
  return p.dirtyFiles ? `Uncommitted changes (${files(p.dirtyFiles)})` : 'Uncommitted changes';
}

/** The working tree, in one sentence; null when the reporter did not say. */
export function workingTreeLine(p: RunProvenance, shortSha: string | null): string | null {
  if (p.dirty == null) return null;
  const at = shortSha ? ` at ${shortSha}` : '';
  if (!p.dirty) return `clean${at}`;
  const what = p.dirtyFiles ? `${p.dirtyFiles} uncommitted ${p.dirtyFiles === 1 ? 'file' : 'files'}` : 'uncommitted changes';
  return `${what}${at} — results may not match the commit`;
}

const SOURCES: Record<ExecutorSource, string> = {
  provider: 'detected from the CI provider',
  'ci-env': 'CI flag set, provider unknown',
  option: 'set explicitly by the reporter option',
};

/** "ci (CI flag set, provider unknown)"; the bare executor when the reporter did not say how. */
export function executorLine(p: RunProvenance): string {
  if (p.executorDetectedBy) return `${p.executor} (${SOURCES[p.executorDetectedBy]})`;
  if (isCiFlagOnly(p)) return `${p.executor} (${SOURCES['ci-env']})`;
  return p.executor;
}

/** A run's attachments by upload status, and the review images among them that did not arrive. */
export interface ArtifactCompleteness {
  total: number;
  uploaded: number;
  pending: number;
  failed: number;
  expired: number;
  /** Review captures in the run. */
  reviewCaptures: number;
  /** Review captures whose image is not (or no longer) stored. */
  reviewCapturesMissing: number;
}

/** "42 uploaded, 2 failed; 1 of 12 review images missing"; null for a run without attachments. */
export function artifactsLine(a: ArtifactCompleteness): string | null {
  if (a.total === 0) return null;
  const parts = [
    `${a.uploaded} uploaded`,
    a.pending ? `${a.pending} pending` : null,
    a.failed ? `${a.failed} failed` : null,
    a.expired ? `${a.expired} expired` : null,
  ].filter(Boolean);
  const review = a.reviewCapturesMissing ? `; ${a.reviewCapturesMissing} of ${a.reviewCaptures} review images missing` : '';
  return `${parts.join(', ')}${review}`;
}
