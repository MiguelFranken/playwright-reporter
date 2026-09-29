/**
 * A project's visual diff settings (`projects.settings.visualDiff`): how
 * sensitive the comparison is, and when a measured change is small enough to
 * approve for the reviewer.
 *
 * The default approves only what has no visible change at all — pixels that
 * differ by anti-aliasing or in their PNG encoding — which is always safe.
 * A tolerance above zero trades review work for the risk of missing a tiny
 * but real change, so it is the project's call.
 */
import { createHash } from 'node:crypto';
import type { DiffRegion } from '@miguelfranken/ui/lib/review';
import { DEFAULT_DIFF_THRESHOLD, DIFF_ALGORITHM } from './engine';

export interface VisualDiffSettings {
  /** pixelmatch's colour threshold, 0.01–0.5; lower is more sensitive. */
  threshold: number;
  /** Approve a changed image automatically when its change is within the tolerance. */
  autoApprove: boolean;
  /** At most this many changed pixels… */
  maxChangedPixels: number;
  /** …or at most this share of the image, in percent (0 = off). */
  maxChangedPercent: number;
}

export const DEFAULT_VISUAL_DIFF: VisualDiffSettings = { threshold: DEFAULT_DIFF_THRESHOLD, autoApprove: true, maxChangedPixels: 0, maxChangedPercent: 0 };

export const THRESHOLD_RANGE = { min: 0.01, max: 0.5 } as const;
export const MAX_TOLERANCE_PIXELS = 1_000_000;
export const MAX_TOLERANCE_PERCENT = 5;

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The settings a project stored, with defaults for what it did not and out-of-range values clamped. */
export function visualDiffSettings(settings: Record<string, unknown> | null | undefined): VisualDiffSettings {
  const raw = (settings?.visualDiff ?? {}) as Record<string, unknown>;
  const threshold = num(raw.threshold);
  const pixels = num(raw.maxChangedPixels);
  const percent = num(raw.maxChangedPercent);
  return {
    threshold: threshold === undefined ? DEFAULT_VISUAL_DIFF.threshold : clamp(threshold, THRESHOLD_RANGE.min, THRESHOLD_RANGE.max),
    autoApprove: typeof raw.autoApprove === 'boolean' ? raw.autoApprove : DEFAULT_VISUAL_DIFF.autoApprove,
    maxChangedPixels: pixels === undefined ? 0 : Math.round(clamp(pixels, 0, MAX_TOLERANCE_PIXELS)),
    maxChangedPercent: percent === undefined ? 0 : clamp(percent, 0, MAX_TOLERANCE_PERCENT),
  };
}

/**
 * Whether a measured change is within the tolerance. A page that changed size
 * never is: a layout that grew is not noise.
 */
export function withinTolerance(diff: { changedPixels: number; ratio: number; sizeChanged: boolean }, s: VisualDiffSettings): boolean {
  if (diff.sizeChanged) return false;
  if (diff.changedPixels <= s.maxChangedPixels) return true;
  return s.maxChangedPercent > 0 && diff.ratio * 100 <= s.maxChangedPercent;
}

type Rect = Pick<DiffRegion, 'x' | 'y' | 'width' | 'height'>;

/**
 * What a comparison's numbers depend on besides the two images: the
 * algorithm, the threshold and the ignored areas. A change to any of them
 * measures the pair again.
 */
export function optionsKey(threshold: number, ignore: readonly Rect[] = []): string {
  const rects = ignore.map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const base = `${DIFF_ALGORITHM};t=${threshold}`;
  if (rects.length === 0) return base;
  return `${base};i=${createHash('sha256').update(JSON.stringify(rects)).digest('hex').slice(0, 16)}`;
}

/** `12 pixels (< 0.01%)`: the change as the tolerance decision's comment says it. */
export function toleranceComment(diff: { changedPixels: number; ratio: number }, baselineRun: number | null): string {
  const pct = diff.ratio * 100;
  const share = diff.changedPixels === 0 ? 'no visible change' : `${diff.changedPixels.toLocaleString('en')} changed pixel${diff.changedPixels === 1 ? '' : 's'} (${pct < 0.01 ? '< 0.01' : pct.toFixed(2)}%)`;
  return `Within the project's diff tolerance: ${share} against the approved image${baselineRun ? ` of run #${baselineRun}` : ''}.`;
}
