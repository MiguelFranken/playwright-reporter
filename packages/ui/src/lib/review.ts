/**
 * The review vocabulary: what a reviewer can decide about a checkpoint image,
 * and the status an image has as a result. Plain data, so the database enums,
 * the server and the views read one list (see AGENTS.md, trap 2).
 *
 * A decision is made about one image — a checkpoint's variant with a given
 * content hash — and holds for every later capture of the same pixels. That is
 * what lets a run with nothing new ask for no review at all.
 */
import type { ReviewDrawingView } from './review-markup';
import type { ReviewThreadView } from './review-threads';
import type { CasePriority } from './test-cases';
import type { Tone } from './tone';
import type { IgnoreRule, IgnoreSummary, RuleValidity } from './visual-diff';

/** What a reviewer records. */
export const REVIEW_DECISIONS = ['approved', 'changes_requested'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/**
 * An image's status:
 * - `approved` / `changes_requested`: a reviewer decided about these exact pixels.
 * - `changed`: it differs from the image it is compared with — the approved
 *   baseline, else (nothing approved yet) the same screen in the run before.
 * - `unchanged`: nobody decided about these pixels, but they are the very
 *   pixels of the image it is compared with: nothing to look at again.
 * - `new`: the screen has no earlier image to compare with: captured for the first time.
 *
 * See `reviewStatusOf`, the one rule the server, the counts and the run
 * comparison apply.
 */
export const REVIEW_STATUSES = ['changed', 'new', 'changes_requested', 'unchanged', 'approved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The statuses that still ask for a reviewer. */
export const NEEDS_REVIEW: readonly ReviewStatus[] = ['changed', 'new'];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  approved: 'Approved',
  changes_requested: 'Changes requested',
  changed: 'Changed',
  unchanged: 'Unchanged',
  new: 'New',
};

export const REVIEW_STATUS_TONES: Record<ReviewStatus, Tone> = {
  approved: 'success',
  changes_requested: 'danger',
  changed: 'warning',
  unchanged: 'neutral',
  new: 'info',
};

/** The storyboard's status filter; `needs-review` is `changed` and `new`. */
export const REVIEW_FILTERS = ['needs-review', 'all', 'changed', 'new', 'unchanged', 'changes_requested', 'approved'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export const REVIEW_FILTER_LABELS: Record<ReviewFilter, string> = {
  'needs-review': 'Needs review',
  all: 'All',
  changed: 'Changed',
  new: 'New',
  unchanged: 'Unchanged',
  changes_requested: 'Changes requested',
  approved: 'Approved',
};

/**
 * An image's status from what is known about it: the decision about its exact
 * pixels, else how it compares with its reference — the approved baseline
 * while there is one, else the run before (or, comparing a whole run, the run
 * chosen). `reference` is the reference's content hash, `null` when it has
 * none; `undefined` means there is no reference at all.
 */
export function reviewStatusOf(input: {
  decision: ReviewDecision | null | undefined;
  /** The checkpoint and variant have an approved baseline (these pixels differ from it, or `decision` would say so). */
  approved: boolean;
  sha256: string | null | undefined;
  reference: { sha256: string | null | undefined } | null | undefined;
}): ReviewStatus {
  if (input.decision) return input.decision;
  if (input.approved) return 'changed';
  if (!input.reference) return 'new';
  return input.sha256 && input.sha256 === input.reference.sha256 ? 'unchanged' : 'changed';
}

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

/**
 * An image's status when a reviewer compares the whole run with another one
 * (`?against=previous`, `run:<n>`): did the screen change since that run?
 * Whatever was approved before plays no part — `unchanged` when it has that
 * run's very pixels, `changed` when it differs, `new` when that run did not
 * capture the screen. A decision about these exact pixels still answers for
 * a changed image (it was looked at), and a change request always shows: it
 * waits for a fix.
 */
export function statusAgainstRun(input: { decision: ReviewDecision | null | undefined; sha256: string | null | undefined; reference: { sha256: string | null | undefined } | null | undefined }): ReviewStatus {
  if (input.decision === 'changes_requested') return input.decision;
  const status = reviewStatusOf({ decision: null, approved: false, sha256: input.sha256, reference: input.reference });
  return status === 'changed' && input.decision ? input.decision : status;
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
  /** `tolerance`: approved automatically, the change measured under the project's tolerance. */
  source?: DecisionSource;
}

/** Who made a decision: a reviewer (or an agent acting for one), or the project's diff tolerance. */
export const DECISION_SOURCES = ['human', 'tolerance'] as const;
export type DecisionSource = (typeof DECISION_SOURCES)[number];

// ---------------------------------------------------------------- pixel diffs

/** A rectangle of an image, in its own pixels, and how many of them changed. */
export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
}

/** Rows of an image, in its own pixels: a band of content added or removed. */
export interface DiffBand {
  y: number;
  height: number;
}

/**
 * A page whose content moved: rows inserted or removed push everything below
 * them down or up, so a plain pixel comparison marks the rest of the page as
 * changed. The aligned comparison matches the unmoved rows instead.
 */
export interface DiffShift {
  /** Bands of this run's image that the reference does not have. */
  inserted: DiffBand[];
  /** Bands of the reference that this run's image does not have. */
  removed: DiffBand[];
  /** Rows of this run's image that match a reference row, moved or not. */
  matchedRows: number;
}

/**
 * - `pending`: queued or being measured.
 * - `done`: measured; the numbers are there.
 * - `failed`: an image could not be read (expired, corrupt).
 * - `too_large`: over the deployment's pixel budget; the CSS comparisons still work.
 */
export const DIFF_STATES = ['pending', 'done', 'failed', 'too_large'] as const;
export type DiffState = (typeof DIFF_STATES)[number];

/** How a capture differs from the image it is compared with, pixel by pixel. */
export interface ReviewDiffView {
  id: string;
  state: DiffState;
  /** The image it is measured against: the approved baseline, the run before, or another line of work. */
  against: 'baseline' | 'previous' | 'compare';
  /** Changed pixels, anti-aliasing excluded; area only one image covers counts as changed. */
  changedPixels: number;
  totalPixels: number;
  /** `changedPixels / totalPixels`, 0–1. */
  ratio: number;
  sizeChanged: boolean;
  base?: { width: number; height: number } | null;
  head?: { width: number; height: number } | null;
  /** In this run's image pixels, reading order. */
  regions: DiffRegion[];
  regionsTruncated?: boolean;
  /** This run's image size, transparent except the changed pixels (red). */
  overlayUrl?: string | null;
  shift?: DiffShift | null;
  /** Under the project's tolerance: the change is noise and was approved for the reviewer. */
  withinTolerance?: boolean;
  error?: string | null;
  /** The same comparison before any rule left areas out, when rules apply and it is measured. */
  raw?: { changedPixels: number; ratio: number; regions: DiffRegion[]; overlayUrl?: string | null; state: DiffState } | null;
}

/** `0.42%`, `< 0.01%`, `18%`: a changed share a reviewer can compare at a glance. */
export function formatChangedShare(ratio: number): string {
  if (ratio <= 0) return '0%';
  const pct = ratio * 100;
  if (pct < 0.01) return '< 0.01%';
  if (pct < 1) return `${pct.toFixed(2).replace(/0$/, '')}%`;
  if (pct < 10) return `${pct.toFixed(1).replace(/\.0$/, '')}%`;
  return `${Math.round(pct)}%`;
}

/** `3 regions · 0.42%`, `1 region · height +120 px`: a measured diff in a few words. */
export function describeDiff(diff: ReviewDiffView): string {
  if (diff.state === 'pending') return 'Measuring the difference…';
  if (diff.state === 'failed') return 'The difference could not be measured.';
  if (diff.state === 'too_large') return 'Too large to measure; compare by eye.';
  if (diff.changedPixels === 0 && !diff.sizeChanged) return 'No visible change';
  const parts = [`${diff.regions.length}${diff.regionsTruncated ? '+' : ''} ${diff.regions.length === 1 ? 'region' : 'regions'}`, formatChangedShare(diff.ratio)];
  const size = sizeChange(diff);
  if (size) parts.push(size);
  return parts.join(' · ');
}

/** `height +120 px`, `width −8 px, height +40 px`, or null when the size is the same. */
export function sizeChange(diff: Pick<ReviewDiffView, 'base' | 'head' | 'sizeChanged'>): string | null {
  if (!diff.sizeChanged || !diff.base || !diff.head) return null;
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
  const parts: string[] = [];
  if (diff.head.width !== diff.base.width) parts.push(`width ${signed(diff.head.width - diff.base.width)} px`);
  if (diff.head.height !== diff.base.height) parts.push(`height ${signed(diff.head.height - diff.base.height)} px`);
  return parts.join(', ') || null;
}

/** How loud a measured change is, for the badge's tone: noise, a small change, a large one. */
export function diffMagnitude(diff: Pick<ReviewDiffView, 'state' | 'ratio' | 'changedPixels' | 'sizeChanged'>): 'none' | 'minor' | 'major' | null {
  if (diff.state !== 'done') return null;
  if (diff.changedPixels === 0 && !diff.sizeChanged) return 'none';
  return diff.sizeChanged || diff.ratio >= 0.01 ? 'major' : 'minor';
}

/** The storyboard's order: capture order, or the most changed images first. */
export const REVIEW_SORTS = ['sequence', 'most-changed'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];
export const REVIEW_SORT_LABELS: Record<ReviewSort, string> = { sequence: 'Journey order', 'most-changed': 'Most changed first' };

/** A capture's changed share for sorting: unmeasured images sort after measured changes, before unchanged ones. */
export function changeScore(capture: Pick<ReviewCaptureView, 'diff' | 'status'>): number {
  const d = capture.diff;
  if (!d || d.state !== 'done') return capture.status === 'changed' || capture.status === 'new' ? 0.000001 : 0;
  return d.sizeChanged ? Math.max(d.ratio, 0.01) + 1 : d.ratio;
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
  /**
   * "Changes requested" on this checkpoint and variant without a comment — so
   * no thread says what — still standing: on these pixels (`onThisImage`), or
   * on an earlier image this one replaced, which is then to be checked.
   */
  request?: { by?: string | null; at: string; runNumber?: number | null; captureId?: string | null; onThisImage: boolean } | null;
  /**
   * What the image is compared with instead of its default reference: another
   * line of work's capture of the same screen (the library compares two), or
   * the run a reviewer compares the whole review with (`runNumber`).
   */
  compare?: { captureId: string; image: ReviewImage; label: string; same: boolean; runNumber?: number } | null;
  /** How the image differs from the one the viewer compares it with, when measured. */
  diff?: ReviewDiffView | null;
  /** Areas left out of the comparison (a clock, an ad), in this image's pixels: the active rules that fit it. */
  ignoreRegions?: DiffRegion[];
  /** The checkpoint's rules and what they did to this comparison. */
  ignore?: ReviewIgnoreView | null;
  /** A tolerance approval made under other rules: no longer counts, kept as history. */
  staleTolerance?: ReviewDecisionView | null;
  /** Comment threads on the image: its own and the open ones placed on earlier captures of it. */
  threads?: ReviewThreadView[];
  /** Drawings on the image, on their own (pen, arrows, boxes): shown with the pins, erased with the eraser. */
  drawings?: ReviewDrawingView[];
  /** The run it was captured in, where one flow shows several runs' images (the library). */
  runNumber?: number | null;
}

/** The rules of a checkpoint's variant as the viewer shows and edits them. */
export interface ReviewIgnoreView extends IgnoreSummary {
  rules: IgnoreRule[];
  suspendedRules: { rule: IgnoreRule; validity: RuleValidity }[];
}

// ---------------------------------------------------------------- what to compare with

/**
 * What the viewer compares an image with, chosen by the reviewer. A rule, not
 * a pair: it holds while the reviewer moves from checkpoint to checkpoint.
 * - `auto`: the approved baseline, else the run before (what a review needs).
 * - `baseline`: the approved baseline.
 * - `previous`: the same screen in the run before this one.
 * - `comments`: the newest earlier image that still has open comments.
 * - `run:<n>`: the same screen as run n captured it.
 */
export const COMPARE_RULES = ['auto', 'baseline', 'previous', 'comments'] as const;
export type CompareRule = (typeof COMPARE_RULES)[number] | `run:${number}`;

export const COMPARE_RULE_LABELS: Record<(typeof COMPARE_RULES)[number], string> = {
  auto: 'Automatic',
  baseline: 'Approved baseline',
  previous: 'Run before',
  comments: 'Latest open comments',
};

export function parseCompareRule(value: string | null | undefined): CompareRule {
  if ((COMPARE_RULES as readonly string[]).includes(value ?? '')) return value as CompareRule;
  const run = /^run:(\d{1,9})$/.exec(value ?? '');
  return run && Number(run[1]) > 0 ? `run:${Number(run[1])}` : 'auto';
}

/** The run number a `run:<n>` rule names. */
export const compareRuleRun = (rule: CompareRule): number | null => (rule.startsWith('run:') ? Number(rule.slice(4)) : null);

/** Another run's capture of the same screen (checkpoint and variant) that an image can be compared with. */
export interface CompareTargetView {
  captureId: string;
  runNumber: number;
  image: ReviewImage;
  /** The same pixels as the image it would be compared with. */
  same: boolean;
  branch?: string | null;
  /** When its run started. */
  at?: string | null;
  /** Open comment threads placed on this image; resolved ones do not count. */
  openThreads: number;
}

/**
 * The rules a whole run's review can be compared under: every screen with
 * the run before it, or with run n. The others pick per image.
 */
export const isRunCompareRule = (rule: CompareRule): boolean => rule === 'previous' || compareRuleRun(rule) !== null;

/** The capture already shows what the rule picks: the server compared the whole review with it. */
export function comparedByRule(capture: Pick<ReviewCaptureView, 'previous' | 'compare'>, rule: CompareRule): boolean {
  const compare = capture.compare;
  if (!compare) return false;
  if (rule === 'previous') return Boolean(capture.previous && compare.captureId === capture.previous.captureId);
  const run = compareRuleRun(rule);
  return run !== null && compare.runNumber === run;
}

/** Another run a whole run's review can be compared with, as its "Compare with" lists it. */
export interface RunCompareTargetView {
  runNumber: number;
  branch?: string | null;
  sha?: string | null;
  /** When it started. */
  at?: string | null;
  /** How many of the reviewed run's screens it captured too (with the image still stored). */
  screens: number;
}

/** What an image is compared with under a rule, and whether the rule had to fall back to `auto`. */
export interface ResolvedCompare {
  /** The reference to show instead of the default one; `null` keeps the default (baseline, else the run before). */
  target: { captureId: string; image: ReviewImage; label: string; same: boolean } | null;
  /** The rule found nothing for this image, so the default is shown. */
  fellBack: boolean;
}

/**
 * The reference a rule picks for a capture, from what the capture knows
 * (baseline, run before) and the other runs' captures of its screen. A
 * reference that is the default one anyway comes back as `null`, so the
 * comparison already measured for it is kept.
 */
export function resolveCompare(
  capture: Pick<ReviewCaptureView, 'id' | 'baseline' | 'previous' | 'compare'>,
  rule: CompareRule,
  targets: readonly CompareTargetView[] | null | undefined,
): ResolvedCompare {
  if (rule === 'auto' || comparedByRule(capture, rule)) return { target: null, fellBack: false };
  const defaultId = capture.baseline?.captureId ?? capture.previous?.captureId ?? null;
  const pick = (t: ResolvedCompare['target']): ResolvedCompare => (t ? { target: t.captureId === defaultId ? null : t, fellBack: false } : { target: null, fellBack: true });
  if (rule === 'baseline') {
    const b = capture.baseline;
    return pick(b ? { captureId: b.captureId, image: b.image, label: `Approved${b.runNumber ? ` (#${b.runNumber})` : ''}`, same: b.same } : null);
  }
  if (rule === 'previous') {
    const p = capture.previous;
    return pick(p ? { captureId: p.captureId, image: p.image, label: `Run #${p.runNumber}`, same: p.same } : null);
  }
  // The rest need the other runs; until they arrive the default stays on show without a note.
  if (!targets) return { target: null, fellBack: false };
  const others = targets.filter((t) => t.captureId !== capture.id);
  const run = compareRuleRun(rule);
  const found = rule === 'comments' ? others.find((t) => t.openThreads > 0) : others.find((t) => t.runNumber === run);
  return pick(found ? { captureId: found.captureId, image: found.image, label: `Run #${found.runNumber}`, same: found.same } : null);
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
  /**
   * In the library, a checkpoint the flow's newest run did not capture (it
   * ran only some tests, or the test failed before it): the older run it
   * comes from, and that attempt's result and video.
   */
  origin?: { runNumber: number; resultHref: string; videoUrl?: string | null } | null;
}

/** A test case a flow's test is linked to. */
export interface ReviewCaseRef {
  /** `TC-12`. */
  key: string;
  title: string;
  href: string;
  /** Its suite, outermost first; empty when the case has none. */
  suitePath: string[];
  priority?: CasePriority;
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
  /** The run the flow's result belongs to. */
  runNumber?: number | null;
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

export const emptyReviewCounts = (): ReviewCounts => ({ approved: 0, changes_requested: 0, changed: 0, unchanged: 0, new: 0 });

export function countStatuses(flows: readonly ReviewFlowView[], variant?: string | null): ReviewCounts {
  const counts = emptyReviewCounts();
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
 * The viewer's side panel — deciding and the comments: shown or folded away,
 * and how wide, in pixels. Kept from one session to the next.
 */
export interface ReviewPanelSettings {
  open: boolean;
  width: number;
}

/** How wide the viewer's side panel can be dragged, and where it starts. */
export const REVIEW_PANEL = { min: 280, max: 640, default: 320 } as const;

export const DEFAULT_REVIEW_PANEL: ReviewPanelSettings = { open: true, width: REVIEW_PANEL.default };

/** A saved panel setting made safe: the width within its limits, open unless it was folded. */
export function reviewPanel(saved: Partial<ReviewPanelSettings> | null | undefined): ReviewPanelSettings {
  const width = typeof saved?.width === 'number' && Number.isFinite(saved.width) ? Math.round(Math.min(REVIEW_PANEL.max, Math.max(REVIEW_PANEL.min, saved.width))) : REVIEW_PANEL.default;
  return { open: saved?.open !== false, width };
}

/**
 * How the viewer frames an image: a screen of `width` × `height` CSS pixels
 * the capture is scaled into (by width) and scrolls in, shown at `zoom`.
 * `captured` uses each capture's own viewport; `fit` picks the zoom that
 * shows the whole frame. The viewer never shows a frame wider than it has
 * room for, nor taller: a zoom above what fits the width is held at it, and a
 * frame taller than the space ends there and scrolls inside. `fill` drops
 * the frame altogether: the screens span the whole space, edge to edge, at
 * the zoom that fits their width — a desktop capture on a small laptop.
 */
export interface FrameSettings {
  preset: FramePreset;
  width: number;
  height: number;
  zoom: number | 'fit';
  fill?: boolean;
}

export const DEFAULT_FRAME: FrameSettings = { preset: 'captured', width: 1280, height: 720, zoom: 'fit' };

/** The frame a capture is shown in under the settings. */
export function frameFor(settings: FrameSettings, capture: Parameters<typeof captureViewport>[0]): FrameSize {
  if (settings.preset === 'captured') return captureViewport(capture);
  return { width: Math.max(160, Math.round(settings.width)), height: Math.max(160, Math.round(settings.height)) };
}

const MIN_ZOOM = 0.1;

/** The largest zoom at which frames side by side (with `gap` between them) fit into `available` CSS pixels of width. */
export function widthZoom(frames: readonly FrameSize[], available: number, gap = 24): number {
  if (frames.length === 0 || available <= 0) return 1;
  // The gaps between the screens stay their size at any zoom.
  const width = frames.reduce((sum, f) => sum + f.width, 0);
  return Math.max(MIN_ZOOM, (available - gap * (frames.length - 1)) / width);
}

/** The zoom that fits frames side by side (with `gap` between them) into the space available. */
export function fitZoom(frames: readonly FrameSize[], available: FrameSize, gap = 24): number {
  if (frames.length === 0 || available.width <= 0 || available.height <= 0) return 1;
  const height = Math.max(...frames.map((f) => f.height));
  return Math.max(MIN_ZOOM, Math.min(1, widthZoom(frames, available.width, gap), available.height / height));
}

/**
 * The zoom a frame is shown at: `fit`, else the zoom asked for, held at the
 * largest that fits the width — the space never scrolls sideways.
 */
export function shownZoom(zoom: FrameSettings['zoom'], frames: readonly FrameSize[], available: FrameSize, gap = 24): number {
  return zoom === 'fit' ? fitZoom(frames, available, gap) : Math.min(zoom, widthZoom(frames, available.width, gap));
}

/** Screens spanning the whole space: as wide as it is at the zoom that fits their width (gaps included), and as tall. */
export function fillFrames(frames: readonly FrameSize[], available: FrameSize, gap = 24): { zoom: number; screens: FrameSize[] } {
  const zoom = widthZoom(frames, available.width, gap);
  return { zoom, screens: frames.map((f) => (available.height > 0 ? { width: f.width, height: Math.max(24, Math.floor(available.height)) / zoom } : f)) };
}

/** A frame cut to the `height` CSS pixels there is room for at `zoom`: a longer screen ends at the space's edge and scrolls inside. */
export function frameWithin(frame: FrameSize, height: number, zoom: number): FrameSize {
  if (height <= 0) return frame;
  return { width: frame.width, height: Math.max(24 / zoom, Math.min(frame.height, Math.floor(height) / zoom)) };
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
  /** Flows in this folder and everything below it. */
  total: number;
  /** Of those, the flows with a screen that still needs review. */
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

/**
 * The flows as a tree of folders, in the order they come. Counts are flows,
 * the unit people browse and act on: how many screens a flow captures (and in
 * how many variants) says nothing about how much there is to look at.
 */
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
    const waits = flow.checkpoints.some((c) => c.captures.some((cap) => NEEDS_REVIEW.includes(cap.status)));
    for (let i = 1; i <= path.length; i++) {
      const f = index.get(folderId(path.slice(0, i)))!;
      f.total++;
      if (waits) f.needsReview++;
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
