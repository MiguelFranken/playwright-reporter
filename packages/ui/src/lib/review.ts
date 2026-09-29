/**
 * The review vocabulary: what a reviewer can decide about a checkpoint image,
 * and the status an image has as a result. Plain data, so the database enums,
 * the server and the views read one list (see AGENTS.md, trap 2).
 *
 * A decision is made about one image — a checkpoint's variant with a given
 * content hash — and holds for every later capture of the same pixels. That is
 * what lets a run with nothing new ask for no review at all.
 */
import type { ReviewThreadView } from './review-threads';
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
  /** Comment threads on the image: its own and the open ones placed on earlier captures of it. */
  threads?: ReviewThreadView[];
}

export interface ReviewCheckpointView {
  id: string;
  /** Ids of checkpoints merged into this one (the same test in another Playwright project): links to them open this one. */
  aliases?: string[];
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

/** A test case a flow's test is linked to. */
export interface ReviewCaseRef {
  /** `TC-12`. */
  key: string;
  title: string;
  href: string;
  /** Its suite, outermost first; empty when the case has none. */
  suitePath: string[];
}

/** A test's review checkpoints, in order: one journey through the product. */
export interface ReviewFlowView {
  resultId: string;
  testId?: string | null;
  /** The test cases the test is linked to; the first decides its folder when grouping by suite. */
  cases?: ReviewCaseRef[];
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
  /** With an approval: also resolve the images' open comment threads. */
  resolveThreads?: boolean;
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

// ---------------------------------------------------------------- frames

export interface FrameSize {
  width: number;
  height: number;
}

/** The CSS viewport of a variant nobody recorded: a mobile variant is a phone, not a monitor. */
const VARIANT_SHAPES: Record<string, FrameSize> = {
  mobile: { width: 390, height: 844 },
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
  laptop: { width: 1440, height: 900 },
};

/**
 * The screen a capture was taken on, in CSS pixels: its recorded viewport,
 * else what its variant name says (a Playwright project called "mobile" or
 * "Mobile Safari" is a phone), else a desktop.
 */
export function captureViewport(capture: { variant: string; viewport?: FrameSize | null; isMobile?: boolean | null }): FrameSize {
  if (capture.viewport?.width && capture.viewport.height) return capture.viewport;
  const name = capture.variant.toLowerCase();
  if (capture.isMobile) return VARIANT_SHAPES.mobile;
  for (const [key, size] of Object.entries(VARIANT_SHAPES)) if (name.includes(key)) return size;
  if (/iphone|pixel|android|galaxy/.test(name)) return VARIANT_SHAPES.mobile;
  if (/ipad/.test(name)) return VARIANT_SHAPES.tablet;
  return VARIANT_SHAPES.desktop;
}

/** Screen sizes to look at a capture on, like a browser's device toolbar. */
export const FRAME_PRESETS = [
  { value: 'captured', label: 'As captured' },
  { value: 'desktop', label: 'Desktop', size: { width: 1280, height: 720 } },
  { value: 'laptop', label: 'Laptop', size: { width: 1440, height: 900 } },
  { value: 'tablet', label: 'Tablet', size: { width: 768, height: 1024 } },
  { value: 'iphone', label: 'iPhone', size: { width: 390, height: 844 } },
  { value: 'custom', label: 'Custom' },
] as const satisfies readonly { value: string; label: string; size?: FrameSize }[];
export type FramePreset = (typeof FRAME_PRESETS)[number]['value'];

export const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5] as const;

/**
 * How the viewer frames an image: a screen of `width` × `height` CSS pixels
 * the capture is scaled into (by width) and scrolls in, shown at `zoom`.
 * `captured` uses each capture's own viewport; `fit` picks the zoom that
 * shows the whole frame.
 */
export interface FrameSettings {
  preset: FramePreset;
  width: number;
  height: number;
  zoom: number | 'fit';
}

export const DEFAULT_FRAME: FrameSettings = { preset: 'captured', width: 1280, height: 720, zoom: 'fit' };

/** The frame a capture is shown in under the settings. */
export function frameFor(settings: FrameSettings, capture: Parameters<typeof captureViewport>[0]): FrameSize {
  if (settings.preset === 'captured') return captureViewport(capture);
  return { width: Math.max(160, Math.round(settings.width)), height: Math.max(160, Math.round(settings.height)) };
}

/** The zoom that fits frames side by side (with `gap` between them) into the space available. */
export function fitZoom(frames: readonly FrameSize[], available: FrameSize, gap = 24): number {
  if (frames.length === 0 || available.width <= 0 || available.height <= 0) return 1;
  const width = frames.reduce((sum, f) => sum + f.width, 0) + gap * (frames.length - 1);
  const height = Math.max(...frames.map((f) => f.height));
  return Math.max(0.1, Math.min(1, available.width / width, available.height / height));
}

/**
 * What a storyboard is for. `review`: deciding about changes — statuses,
 * comparisons, approvals. `library`: documentation — the product's screens and
 * flows as a branch or pull request shows them, nothing to decide.
 */
export type StoryboardMode = 'review' | 'library';

// ---------------------------------------------------------------- folders

export const REVIEW_GROUPINGS = ['suite', 'file'] as const;
export type ReviewGrouping = (typeof REVIEW_GROUPINGS)[number];
export const REVIEW_GROUPING_LABELS: Record<ReviewGrouping, string> = { suite: 'Test Cases', file: 'Files' };

/** The folder of flows without a test case, when grouping by suite. */
export const UNLINKED_FOLDER = 'Not in a test case';

/** A folder of the review tree: a suite (or directory), its flows and sub-folders. */
export interface ReviewFolder {
  /** The path joined with ` / `: stable, and what the filter selects. */
  id: string;
  name: string;
  path: string[];
  flows: ReviewFlowView[];
  children: ReviewFolder[];
  /** Over this folder and everything below it. */
  total: number;
  needsReview: number;
}

/** Where a flow sits: its first test case's suite, or its spec file's directories and the file. */
export function folderPathOf(flow: ReviewFlowView, grouping: ReviewGrouping): string[] {
  if (grouping === 'suite') {
    const linked = flow.cases?.[0];
    if (linked) return linked.suitePath.length ? linked.suitePath : ['Unassigned cases'];
    return [UNLINKED_FOLDER, flow.file];
  }
  return flow.file.split('/').filter(Boolean);
}

export const folderId = (path: readonly string[]) => path.join(' / ');

/** The flows as a tree of folders, in the order they come. Counts cover every capture below a folder. */
export function buildReviewTree(flows: readonly ReviewFlowView[], grouping: ReviewGrouping): ReviewFolder[] {
  const roots: ReviewFolder[] = [];
  const index = new Map<string, ReviewFolder>();
  const node = (path: string[]): ReviewFolder => {
    const id = folderId(path);
    let found = index.get(id);
    if (found) return found;
    found = { id, name: path[path.length - 1], path, flows: [], children: [], total: 0, needsReview: 0 };
    index.set(id, found);
    if (path.length === 1) roots.push(found);
    else node(path.slice(0, -1)).children.push(found);
    return found;
  };
  for (const flow of flows) {
    const path = folderPathOf(flow, grouping);
    const folder = node(path);
    folder.flows.push(flow);
    const captures = flow.checkpoints.flatMap((c) => c.captures);
    for (let i = 1; i <= path.length; i++) {
      const f = index.get(folderId(path.slice(0, i)))!;
      f.total += captures.length;
      f.needsReview += captures.filter((c) => NEEDS_REVIEW.includes(c.status)).length;
    }
  }
  // Unlinked tests last: the curated suites are what people browse first.
  roots.sort((a, b) => Number(a.name === UNLINKED_FOLDER) - Number(b.name === UNLINKED_FOLDER));
  return roots;
}

/** Every folder with flows of its own, depth first: the sections of the storyboard. */
export function flattenFolders(folders: readonly ReviewFolder[]): ReviewFolder[] {
  return folders.flatMap((f) => [...(f.flows.length ? [f] : []), ...flattenFolders(f.children)]);
}

/** Whether a flow is inside the folder `id` (or `id` is empty). */
export function inFolder(flow: ReviewFlowView, grouping: ReviewGrouping, id: string | null | undefined): boolean {
  if (!id) return true;
  const path = folderId(folderPathOf(flow, grouping));
  return path === id || path.startsWith(`${id} / `);
}
