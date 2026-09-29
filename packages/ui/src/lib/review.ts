/**
 * The review vocabulary: what a reviewer can decide about a checkpoint image,
 * and the status an image has as a result. Plain data, so the database enums,
 * the server and the views read one list (see AGENTS.md, trap 2).
 *
 * A decision is made about one image — a checkpoint's variant with a given
 * content hash — and holds for every later capture of the same pixels. That is
 * what lets a run with nothing new ask for no review at all.
 */
import type { Tone } from './tone';

/** What a reviewer records. */
export const REVIEW_DECISIONS = ['approved', 'changes_requested'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/**
 * An image's status:
 * - `approved` / `changes_requested`: a reviewer decided about these exact pixels.
 * - `changed`: the checkpoint has an approved baseline, and this image differs from it.
 * - `new`: nobody has approved this checkpoint yet.
 */
export const REVIEW_STATUSES = ['changed', 'new', 'changes_requested', 'approved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The statuses that still ask for a reviewer. */
export const NEEDS_REVIEW: readonly ReviewStatus[] = ['changed', 'new'];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  approved: 'Approved',
  changes_requested: 'Changes requested',
  changed: 'Changed',
  new: 'New',
};

export const REVIEW_STATUS_TONES: Record<ReviewStatus, Tone> = {
  approved: 'success',
  changes_requested: 'danger',
  changed: 'warning',
  new: 'info',
};

/** The storyboard's status filter; `needs-review` is `changed` and `new`. */
export const REVIEW_FILTERS = ['needs-review', 'all', 'changed', 'new', 'changes_requested', 'approved'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export const REVIEW_FILTER_LABELS: Record<ReviewFilter, string> = {
  'needs-review': 'Needs review',
  all: 'All',
  changed: 'Changed',
  new: 'New',
  changes_requested: 'Changes requested',
  approved: 'Approved',
};

export function parseReviewFilter(value: string | undefined | null): ReviewFilter {
  return (REVIEW_FILTERS as readonly string[]).includes(value ?? '') ? (value as ReviewFilter) : 'needs-review';
}

export function matchesReviewFilter(status: ReviewStatus, filter: ReviewFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs-review') return NEEDS_REVIEW.includes(status);
  return status === filter;
}

/**
 * Variants in the order a reviewer expects them: desktop before tablet before
 * mobile, then anything else alphabetically.
 */
const VARIANT_RANK: Record<string, number> = { default: 0, desktop: 1, laptop: 2, tablet: 3, mobile: 4 };

export function compareVariants(a: string, b: string): number {
  const ra = VARIANT_RANK[a.toLowerCase()] ?? 10;
  const rb = VARIANT_RANK[b.toLowerCase()] ?? 10;
  return ra - rb || a.localeCompare(b);
}

/** `coupon-applied` → `Coupon applied`: a readable fallback for a checkpoint without a title. */
export function checkpointLabel(name: string, title?: string | null): string {
  if (title) return title;
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

/** Worst first: a checkpoint's status is its most urgent image's. */
export function worstStatus(statuses: readonly ReviewStatus[]): ReviewStatus {
  let worst: ReviewStatus = 'approved';
  for (const s of statuses) if (REVIEW_STATUSES.indexOf(s) < REVIEW_STATUSES.indexOf(worst)) worst = s;
  return worst;
}

// ---------------------------------------------------------------- view models

/** An image the browser can load. `available` is false while it uploads, and after retention deleted it. */
export interface ReviewImage {
  url: string;
  /** A small above-the-fold preview; overviews use it and fall back to `url`. */
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  available: boolean;
  /** Why the image cannot be shown: `pending`, `failed` or `expired`. */
  unavailableReason?: string | null;
}

export interface ReviewDecisionView {
  decision: ReviewDecision;
  by?: string | null;
  at: string;
  comment?: string | null;
  runNumber?: number | null;
}

/** One variant's image of a checkpoint, with what it is compared against. */
export interface ReviewCaptureView {
  id: string;
  variant: string;
  status: ReviewStatus;
  image: ReviewImage;
  viewport?: { width: number; height: number } | null;
  deviceScaleFactor?: number | null;
  isMobile?: boolean | null;
  fullPage?: boolean | null;
  /** The decision these exact pixels carry, when there is one. */
  decision?: ReviewDecisionView | null;
  /** The newest approved image of this checkpoint and variant. */
  baseline?: { captureId: string; image: ReviewImage; runNumber: number | null; same: boolean; approvedAt: string; approvedBy?: string | null } | null;
  /** The same checkpoint and variant in the run before, for a comparison without an approval. */
  previous?: { captureId: string; image: ReviewImage; runNumber: number; same: boolean } | null;
}

export interface ReviewCheckpointView {
  id: string;
  name: string;
  title?: string | null;
  description?: string | null;
  sequence: number;
  kind?: string | null;
  stepPath: string[];
  url?: string | null;
  pageTitle?: string | null;
  /** Milliseconds from the attempt's start; with `videoUrl`, where the moment is in the video. */
  offsetMs?: number | null;
  tags: string[];
  captures: ReviewCaptureView[];
}

/** A test's review checkpoints, in order: one journey through the product. */
export interface ReviewFlowView {
  resultId: string;
  title: string;
  titlePath: string[];
  file: string;
  line?: number | null;
  project?: string | null;
  /** The test's outcome in this run (`passed`, `failed`, `flaky`…). */
  outcome: string;
  flow?: string | null;
  resultHref: string;
  videoUrl?: string | null;
  traceUrl?: string | null;
  /** Playwright's own screenshot of a failure, shown after the last checkpoint. */
  failureImage?: ReviewImage | null;
  checkpoints: ReviewCheckpointView[];
}

export interface ReviewDecisionInput {
  captureIds: string[];
  decision: ReviewDecision;
  comment?: string;
}

/** Counts per status over a set of images. */
export type ReviewCounts = Record<ReviewStatus, number>;

export function countStatuses(flows: readonly ReviewFlowView[], variant?: string | null): ReviewCounts {
  const counts: ReviewCounts = { approved: 0, changes_requested: 0, changed: 0, new: 0 };
  for (const f of flows) for (const c of f.checkpoints) for (const cap of c.captures) if (!variant || cap.variant === variant) counts[cap.status]++;
  return counts;
}

/** Every variant name in the flows, in display order. */
export function variantsOf(flows: readonly ReviewFlowView[]): string[] {
  const set = new Set<string>();
  for (const f of flows) for (const c of f.checkpoints) for (const cap of c.captures) set.add(cap.variant);
  return [...set].sort(compareVariants);
}
