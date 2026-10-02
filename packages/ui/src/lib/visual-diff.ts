/**
 * The vocabulary of a visual comparison between two captures: how a pair is
 * named, what state a comparison is in, how its changed regions are labelled,
 * what an agent can ask to see, and the rules that leave areas out of the
 * comparison. Plain data and pure functions, read by the server (MCP, REST,
 * the app) and the views alike, so no JSX and no directive (see AGENTS.md,
 * trap 2).
 *
 * A comparison id names exactly one pair of captures — the base (what is
 * compared against) and the head (what is looked at) — and nothing else:
 * it is the two capture ids, encoded. The *revision* of a comparison (the
 * rules and settings its numbers were measured under) travels beside it,
 * never inside it, so an id a user copied yesterday still names the same
 * two images today.
 */
import type { DiffRegion } from './review';

// ---------------------------------------------------------------- comparison ids

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX = 'vc_';

function uuidBytes(id: string): Uint8Array {
  const hex = id.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** `vc_…`: the base and head capture ids as one opaque, stable identifier. */
export function encodeComparisonId(baseCaptureId: string, headCaptureId: string): string {
  if (!UUID.test(baseCaptureId) || !UUID.test(headCaptureId)) throw new Error('A comparison names two capture ids.');
  const bytes = new Uint8Array(32);
  bytes.set(uuidBytes(baseCaptureId.toLowerCase()), 0);
  bytes.set(uuidBytes(headCaptureId.toLowerCase()), 16);
  return `${PREFIX}${toBase64Url(bytes)}`;
}

/** The two capture ids a comparison id names, or `null` when it is not one. */
export function decodeComparisonId(id: string): { baseCaptureId: string; headCaptureId: string } | null {
  if (!id.startsWith(PREFIX)) return null;
  const bytes = fromBase64Url(id.slice(PREFIX.length));
  if (!bytes || bytes.length !== 32) return null;
  return { baseCaptureId: bytesUuid(bytes.subarray(0, 16)), headCaptureId: bytesUuid(bytes.subarray(16)) };
}

export const isComparisonId = (value: string) => decodeComparisonId(value) !== null;

// ---------------------------------------------------------------- states

/**
 * What a comparison says about the pair, kept apart from how far the
 * measurement got (`CalculationState`):
 * - `identical`: the same pixels (the same content hash, or measured without a visible change).
 * - `changed`: measured, and pixels differ.
 * - `undetermined`: the hashes differ but nothing is measured yet (or it could not be).
 * - `added`: the head run captured this screen, the base did not.
 * - `not_captured`: the base run captured it, the head run did not (a partial run, a test that failed earlier).
 * - `incompatible`: two different variants, viewports or scales — comparable by eye, not as noise.
 * - `unavailable`: an image is gone (retention) or never arrived.
 */
export const COMPARISON_STATUSES = ['identical', 'changed', 'undetermined', 'added', 'not_captured', 'incompatible', 'unavailable'] as const;
export type ComparisonStatus = (typeof COMPARISON_STATUSES)[number];

/** How far the pixel measurement got. `not_needed`: the hashes are equal, nothing to measure. */
export const CALCULATION_STATES = ['not_needed', 'pending', 'done', 'failed', 'too_large'] as const;
export type CalculationState = (typeof CALCULATION_STATES)[number];

export const COMPARISON_STATUS_LABELS: Record<ComparisonStatus, string> = {
  identical: 'Identical',
  changed: 'Changed',
  undetermined: 'Not measured yet',
  added: 'Only in head',
  not_captured: 'Not captured by head',
  incompatible: 'Incompatible captures',
  unavailable: 'Image unavailable',
};

/** What `list_visual_diffs` can be narrowed to. */
export const COMPARISON_FILTERS = ['changed', 'all', 'identical', 'undetermined', 'added', 'not_captured', 'incompatible'] as const;
export type ComparisonFilter = (typeof COMPARISON_FILTERS)[number];

export function matchesComparisonFilter(status: ComparisonStatus, filter: ComparisonFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'changed') return status === 'changed' || status === 'undetermined';
  return status === filter;
}

// ---------------------------------------------------------------- regions

/** A rectangle in an image's own pixels, from its top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One changed region as the tools address it. `id` is stable within a
 * revision (it is derived from the rectangle), `label` (`D1`, `D2`…) is its
 * reading-order number — the one drawn on the annotated image and used in
 * conversation. Comment threads keep their own `#n` numbers: two namespaces.
 */
export interface VisualDiffRegion {
  id: string;
  label: string;
  /** Where the change is in the head image; `null` for area only the base has (a removed footer). */
  headRect: Rect | null;
  /** The same rectangle in the base image, when it lies within it. */
  baseRect: Rect | null;
  /** Changed pixels in the region before any rule left some out. */
  rawChangedPixels: number;
  /** How the active rules touch the region: not at all, in part, or wholly. */
  ignore: 'none' | 'partial' | 'full';
  /** The ids of the rules that touch it. */
  ignoredBy: string[];
  /** Area the base has and the head has not (the head is shorter or narrower), or the other way round. */
  kind: 'change' | 'added-area' | 'removed-area';
}

export const regionLabel = (index: number) => `D${index + 1}`;

/** Reading order: top to bottom, then left to right — the order the labels count in. */
export const regionReadingOrder = (a: Rect, b: Rect) => a.y - b.y || a.x - b.x;

/** The id of a region: its rectangle, which does not change while the measurement does not. */
export const regionId = (r: Rect, side: 'head' | 'base' = 'head') => `${side === 'base' ? 'b' : 'r'}${r.x}-${r.y}-${r.width}-${r.height}`;

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/** The intersection of two rectangles, or `null` when they do not meet. */
export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** The pixels of the union of rectangles, each counted once. */
export function unionArea(rects: readonly Rect[]): number {
  // Sweep over the distinct x edges; between two edges, sum the merged y spans.
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.width]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const spans = rects
      .filter((r) => r.x <= x0 && r.x + r.width >= x1)
      .map((r) => [r.y, r.y + r.height] as const)
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let end = -Infinity;
    let start = 0;
    for (const [y0, y1] of spans) {
      if (y0 > end) {
        if (end > -Infinity) covered += end - start;
        start = y0;
        end = y1;
      } else end = Math.max(end, y1);
    }
    if (end > -Infinity) covered += end - start;
    area += covered * (x1 - x0);
  }
  return area;
}

/**
 * The measured regions of a comparison as the tools list them, in reading
 * order with their labels, each saying which active rules touch it. Area the
 * base alone covers is added as a region of its own, so a removed footer is
 * something an agent can look at and not something the head image hides.
 */
export function labelRegions(
  regions: readonly DiffRegion[],
  sizes: { base: { width: number; height: number } | null; head: { width: number; height: number } | null },
  rules: readonly (Rect & { id: string })[] = [],
): VisualDiffRegion[] {
  const head = sizes.head;
  const base = sizes.base;
  const out: Omit<VisualDiffRegion, 'label'>[] = [];
  const headExtra = (r: DiffRegion) => Boolean(base && head && (r.x >= base.width || r.y >= base.height) && (r.x + r.width > base.width || r.y + r.height > base.height));
  for (const r of [...regions].sort(regionReadingOrder)) {
    const rect = { x: r.x, y: r.y, width: r.width, height: r.height };
    const touching = rules.filter((rule) => intersects(rule, rect));
    const ignore = touching.length === 0 ? 'none' : touching.some((rule) => contains(rule, rect)) || unionArea(touching.map((t) => intersection(t, rect)!).filter(Boolean)) >= rect.width * rect.height ? 'full' : 'partial';
    const inBase = base ? intersection(rect, { x: 0, y: 0, width: base.width, height: base.height }) : null;
    out.push({
      id: regionId(rect),
      headRect: rect,
      baseRect: inBase && inBase.width === rect.width && inBase.height === rect.height ? rect : inBase,
      rawChangedPixels: r.pixels,
      ignore,
      ignoredBy: touching.map((t) => t.id),
      kind: headExtra(r) ? 'added-area' : 'change',
    });
  }
  if (base && head) {
    const w = Math.min(base.width, head.width);
    const h = Math.min(base.height, head.height);
    if (base.width > w) {
      const rect = { x: w, y: 0, width: base.width - w, height: base.height };
      out.push({ id: regionId(rect, 'base'), headRect: null, baseRect: rect, rawChangedPixels: rect.width * rect.height, ignore: 'none', ignoredBy: [], kind: 'removed-area' });
    }
    if (base.height > h) {
      const rect = { x: 0, y: h, width: w, height: base.height - h };
      out.push({ id: regionId(rect, 'base'), headRect: null, baseRect: rect, rawChangedPixels: rect.width * rect.height, ignore: 'none', ignoredBy: [], kind: 'removed-area' });
    }
  }
  return out.map((r, i) => ({ ...r, label: regionLabel(i) }));
}

// ---------------------------------------------------------------- images for agents

/**
 * How two images are shown to an agent:
 * - `annotated`: the head image with the regions boxed and numbered (D1, D2…), the areas left out hatched.
 * - `pair`: base and head of the same rectangle, side by side as two images — what a name or a price reads as, then and now.
 * - `highlight`: the head with the changed pixels painted over it.
 * - `mask`: black where nothing changed, white where it did — the authoritative threshold mask.
 * - `difference`: the absolute colour difference, for subtle shifts and rendering noise.
 * - `onion`: the head faded over the base: double edges where something moved.
 * - `base` / `head`: an image as it is, whole or a part of it.
 */
export const VISUAL_DIFF_MODES = ['annotated', 'pair', 'highlight', 'mask', 'difference', 'onion', 'base', 'head'] as const;
export type VisualDiffMode = (typeof VISUAL_DIFF_MODES)[number];

/** The whole image scaled down, the changed regions at their own resolution, or one rectangle. */
export const VISUAL_DIFF_SCOPES = ['overview', 'regions', 'crop'] as const;
export type VisualDiffScope = (typeof VISUAL_DIFF_SCOPES)[number];

/** `raw`: before any rule left areas out (the default when debugging); `effective`: with the active rules applied. */
export const MASK_POLICIES = ['raw', 'effective'] as const;
export type MaskPolicy = (typeof MASK_POLICIES)[number];

// ---------------------------------------------------------------- ignore rules

/** Why an area is left out, in one word a filter can group by. */
export const IGNORE_CATEGORIES = ['dynamic_text', 'time_dependent', 'image_content', 'animation', 'third_party', 'other'] as const;
export type IgnoreCategory = (typeof IGNORE_CATEGORIES)[number];

export const IGNORE_CATEGORY_LABELS: Record<IgnoreCategory, string> = {
  dynamic_text: 'Dynamic text',
  time_dependent: 'Time-dependent',
  image_content: 'Image content',
  animation: 'Animation',
  third_party: 'Third-party content',
  other: 'Other',
};

/** Who put a rule there: a person in the editor, a person accepting an AI suggestion, or a rule saved before rules had a history. */
export const IGNORE_SOURCES = ['manual', 'ai_suggestion', 'legacy'] as const;
export type IgnoreSource = (typeof IGNORE_SOURCES)[number];

/** The capture a rule was drawn on: what says whether it still fits a later image. */
export interface IgnoreGeometry {
  imageWidth: number;
  imageHeight: number;
  originCaptureId: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  deviceScaleFactor: number | null;
}

/** An area a checkpoint's variant leaves out of its comparisons, with where it came from and why. */
export interface IgnoreRule extends Rect {
  id: string;
  reason: string | null;
  category: IgnoreCategory | null;
  source: IgnoreSource;
  /** Switched off but kept: the history stays findable. */
  active: boolean;
  createdAt: string;
  createdBy: string | null;
  /** The AI analysis the rule was accepted from, when it was. */
  analysisId?: string | null;
  geometry: IgnoreGeometry | null;
}

/** What a caller may say about a rule it saves: a rectangle, and optionally the id to keep, a reason, a category and whether it is on. */
export interface IgnoreRuleInput extends Rect {
  id?: string | null;
  reason?: string | null;
  category?: IgnoreCategory | null;
  active?: boolean;
}

/** What rectangles would do to a comparison, measured on the two images and saved nowhere. */
export interface IgnorePreviewView {
  rawChangedPixels: number;
  suppressedPixels: number;
  remainingPixels: number;
  remainingRegions: number;
  /** The rectangles' share of the image, in percent. */
  ignoredAreaPercent: number;
  sizeChanged: boolean;
}

/**
 * Whether a rule applies to an image:
 * - `valid`: drawn on an image of the same size (or on this one).
 * - `legacy`: saved before rules recorded where they were drawn; applied, unchecked.
 * - `geometry_changed`: the image is another size — the area may not be where it was; the rule is suspended.
 * - `out_of_bounds`: the rectangle lies (partly) outside the image.
 * - `inactive`: switched off.
 */
export const RULE_VALIDITIES = ['valid', 'legacy', 'geometry_changed', 'out_of_bounds', 'inactive'] as const;
export type RuleValidity = (typeof RULE_VALIDITIES)[number];

export function ruleValidity(rule: IgnoreRule, image: { width: number | null; height: number | null } | null): RuleValidity {
  if (!rule.active) return 'inactive';
  if (image?.width && image.height && (rule.x + rule.width > image.width || rule.y + rule.height > image.height)) return 'out_of_bounds';
  if (!rule.geometry) return 'legacy';
  if (image?.width && image.height && (rule.geometry.imageWidth !== image.width || rule.geometry.imageHeight !== image.height)) return 'geometry_changed';
  return 'valid';
}

/** The rules that take effect on an image, and the ones that do not (with why). */
export function applicableRules(rules: readonly IgnoreRule[], image: { width: number | null; height: number | null } | null) {
  const applied: IgnoreRule[] = [];
  const suspended: { rule: IgnoreRule; validity: RuleValidity }[] = [];
  for (const rule of rules) {
    const validity = ruleValidity(rule, image);
    if (validity === 'valid' || validity === 'legacy') applied.push(rule);
    else if (validity !== 'inactive') suspended.push({ rule, validity });
  }
  return { applied, suspended };
}

/** How many rules a checkpoint has and what they did to this capture's comparison. */
export interface IgnoreSummary {
  /** Rules switched on. */
  active: number;
  /** A rule was ever saved for this checkpoint and variant, switched on or not. */
  ever: boolean;
  /** Active rules that fit this image and were applied. */
  applied: number;
  /** Active rules suspended on this image (another size, out of bounds). */
  suspended: number;
  revision: number;
  /** Changed pixels before the rules, when measured. */
  rawChangedPixels: number | null;
  /** Changed pixels the rules left out, when both measurements exist. */
  suppressedPixels: number | null;
}

/**
 * How a capture can be filtered by its rules:
 * - `active`: at least one rule switched on.
 * - `ever`: a rule was ever saved, switched on or not.
 * - `applied`: a rule took effect on this comparison.
 * - `suppressed`: a rule left changed pixels out of it.
 * - `fully-suppressed`: pixels changed, and the rules left every one of them out.
 * - `needs-review`: a rule no longer fits this image and was suspended.
 */
export const IGNORE_FILTERS = ['active', 'ever', 'applied', 'suppressed', 'fully-suppressed', 'needs-review'] as const;
export type IgnoreFilter = (typeof IGNORE_FILTERS)[number];

export const IGNORE_FILTER_LABELS: Record<IgnoreFilter, string> = {
  active: 'With areas left out',
  ever: 'Ever had areas left out',
  applied: 'Areas applied here',
  suppressed: 'Changes left out',
  'fully-suppressed': 'Unchanged only thanks to left-out areas',
  'needs-review': 'Left-out areas need a look',
};

export const IGNORE_FILTER_HINTS: Record<IgnoreFilter, string> = {
  active: 'At least one area is switched on for this screen.',
  ever: 'An area was saved for this screen at some point, even if it was removed since.',
  applied: 'An area took effect on this comparison.',
  suppressed: 'At least one changed pixel was left out of this comparison.',
  'fully-suppressed': 'Pixels changed, and the areas left every one of them out.',
  'needs-review': 'An area was drawn on an image of another size and is suspended here.',
};

export function ignoreStates(summary: IgnoreSummary | null | undefined): Set<IgnoreFilter> {
  const out = new Set<IgnoreFilter>();
  if (!summary) return out;
  if (summary.active > 0) out.add('active');
  if (summary.ever) out.add('ever');
  if (summary.applied > 0) out.add('applied');
  if ((summary.suppressedPixels ?? 0) > 0) out.add('suppressed');
  if ((summary.suppressedPixels ?? 0) > 0 && summary.rawChangedPixels !== null && summary.rawChangedPixels === summary.suppressedPixels) out.add('fully-suppressed');
  if (summary.suspended > 0) out.add('needs-review');
  return out;
}

export const matchesIgnoreFilter = (summary: IgnoreSummary | null | undefined, filter: IgnoreFilter | null | undefined) => !filter || ignoreStates(summary).has(filter);

// ---------------------------------------------------------------- policies

/**
 * What a project allows where. Three abilities, decided apart: measuring
 * (always on where the deployment measures), leaving areas out, and asking
 * a model about a comparison — which sends images to a provider and costs
 * money. A deny on a folder beats an allow on a screen inside it.
 */
export const POLICY_CAPABILITIES = ['ignore', 'ai'] as const;
export type PolicyCapability = (typeof POLICY_CAPABILITIES)[number];

export const POLICY_CAPABILITY_LABELS: Record<PolicyCapability, string> = { ignore: 'Leaving areas out', ai: 'AI analysis' };

/**
 * The scopes a rule can name, widest first. `file` is a spec file or a folder of spec
 * files; `suite` is a test case suite (the library groups by either, so both are offered).
 */
export type PolicyScope =
  | { kind: 'project' }
  | { kind: 'file'; path: string }
  | { kind: 'suite'; suiteId: string; name?: string }
  | { kind: 'test'; testId: string; title?: string }
  | { kind: 'screen'; testId: string; checkpointName: string; title?: string }
  | { kind: 'variant'; testId: string; checkpointName: string; variant: string };

export const POLICY_SCOPE_KINDS = ['project', 'file', 'suite', 'test', 'screen', 'variant'] as const;
export type PolicyScopeKind = (typeof POLICY_SCOPE_KINDS)[number];

export const POLICY_SCOPE_LABELS: Record<PolicyScopeKind, string> = {
  project: 'Whole project',
  file: 'Spec file or folder',
  suite: 'Test case suite',
  test: 'Test',
  screen: 'Screen (checkpoint)',
  variant: 'Variant of a screen',
};

export interface PolicyRule {
  id: string;
  scope: PolicyScope;
  capability: PolicyCapability;
  effect: 'allow' | 'deny';
}

/** Whether, when and how a project asks a model about its comparisons. */
export const AI_MODES = ['off', 'manual', 'proactive'] as const;
export type AiMode = (typeof AI_MODES)[number];

export const AI_MODE_LABELS: Record<AiMode, string> = { off: 'Off', manual: 'On request', proactive: 'After every run' };

/** Where a capture sits: everything a policy's scope could match. */
export interface PolicyTarget {
  file: string;
  suiteIds: readonly string[];
  testId: string;
  checkpointName: string;
  variant: string;
}

/** Whether a spec path is `folder` or lies under it, by whole path segments. */
export function pathWithin(path: string, folder: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
  const a = norm(path);
  const b = norm(folder);
  return a === b || a.startsWith(`${b}/`);
}

const SPECIFICITY: Record<PolicyScopeKind, number> = { project: 0, file: 1, suite: 2, test: 3, screen: 4, variant: 5 };

function scopeMatches(scope: PolicyScope, target: PolicyTarget): boolean {
  switch (scope.kind) {
    case 'project':
      return true;
    case 'file':
      return pathWithin(target.file, scope.path);
    case 'suite':
      return target.suiteIds.includes(scope.suiteId);
    case 'test':
      return scope.testId === target.testId;
    case 'screen':
      return scope.testId === target.testId && scope.checkpointName === target.checkpointName;
    case 'variant':
      return scope.testId === target.testId && scope.checkpointName === target.checkpointName && scope.variant === target.variant;
  }
}

export interface PolicyDecision {
  allowed: boolean;
  /** The rule that decided, or `null` for the default. */
  rule: PolicyRule | null;
  reason: string;
}

/**
 * What the rules say for one capture and capability: a deny anywhere up the
 * chain wins (a sensitive checkout flow stays closed to a model however a
 * screen inside it is marked); otherwise the most specific allow; otherwise
 * `defaultAllowed`.
 */
export function resolvePolicy(rules: readonly PolicyRule[], capability: PolicyCapability, target: PolicyTarget, defaultAllowed: boolean): PolicyDecision {
  const matching = rules.filter((r) => r.capability === capability && scopeMatches(r.scope, target));
  const deny = matching.filter((r) => r.effect === 'deny').sort((a, b) => SPECIFICITY[b.scope.kind] - SPECIFICITY[a.scope.kind])[0];
  if (deny) return { allowed: false, rule: deny, reason: `Denied by the ${POLICY_SCOPE_LABELS[deny.scope.kind].toLowerCase()} rule.` };
  const allow = matching.filter((r) => r.effect === 'allow').sort((a, b) => SPECIFICITY[b.scope.kind] - SPECIFICITY[a.scope.kind])[0];
  if (allow) return { allowed: true, rule: allow, reason: `Allowed by the ${POLICY_SCOPE_LABELS[allow.scope.kind].toLowerCase()} rule.` };
  return { allowed: defaultAllowed, rule: null, reason: defaultAllowed ? 'Allowed by default.' : 'Off by default for this project.' };
}

export function describePolicyScope(scope: PolicyScope): string {
  switch (scope.kind) {
    case 'project':
      return 'Whole project';
    case 'file':
      return scope.path;
    case 'suite':
      return scope.name ?? `Suite ${scope.suiteId.slice(0, 8)}`;
    case 'test':
      return scope.title ?? `Test ${scope.testId.slice(0, 8)}`;
    case 'screen':
      return `${scope.title ?? scope.checkpointName}`;
    case 'variant':
      return `${scope.checkpointName} · ${scope.variant}`;
  }
}

// ---------------------------------------------------------------- AI analysis

/** What a model may conclude a region is, before a person agrees. */
export const ANALYSIS_HYPOTHESES = ['dynamic_text', 'time_dependent', 'image_content', 'layout_shift', 'rendering_noise', 'real_change', 'unknown'] as const;
export type AnalysisHypothesis = (typeof ANALYSIS_HYPOTHESES)[number];

export const ANALYSIS_HYPOTHESIS_LABELS: Record<AnalysisHypothesis, string> = {
  dynamic_text: 'Dynamic text (a name, an id)',
  time_dependent: 'Time-dependent (a date, a clock)',
  image_content: 'Image content changed',
  layout_shift: 'Layout shifted',
  rendering_noise: 'Rendering noise',
  real_change: 'A real change',
  unknown: 'Unclear',
};

export const ANALYSIS_RECOMMENDATIONS = ['stabilize_in_repo', 'investigate', 'accept', 'consider_ignore'] as const;
export type AnalysisRecommendation = (typeof ANALYSIS_RECOMMENDATIONS)[number];

export const ANALYSIS_RECOMMENDATION_LABELS: Record<AnalysisRecommendation, string> = {
  stabilize_in_repo: 'Stabilise in the repository',
  investigate: 'Investigate',
  accept: 'Accept as intended',
  consider_ignore: 'Consider leaving the area out',
};

export const ANALYSIS_STATUSES = ['queued', 'running', 'done', 'failed', 'denied', 'over_budget'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  queued: 'Queued',
  running: 'Analysing…',
  done: 'Done',
  failed: 'Failed',
  denied: 'Not allowed here',
  over_budget: 'Over budget',
};

/** What the model said about one region, as a person reviews it. */
export interface AnalysisSuggestionView {
  id: string;
  regionId: string;
  regionLabel: string;
  observation: string;
  hypothesis: AnalysisHypothesis;
  alternatives: string[];
  recommendation: AnalysisRecommendation;
  uncertainty: 'low' | 'medium' | 'high';
  /** Tight rectangles the model proposes leaving out, already checked against the region. */
  proposedRects: Rect[];
  /** What the proposal would do, measured deterministically. */
  effect: { rawChangedPixels: number; suppressedPixels: number; remainingPixels: number } | null;
  decision: 'open' | 'accepted' | 'rejected';
}

export interface AnalysisView {
  id: string;
  status: AnalysisStatus;
  model: string;
  createdAt: string;
  finishedAt: string | null;
  summary: string | null;
  error: string | null;
  /** In micro-dollars: reserved before the call, actual after it. */
  reservedMicroUsd: number;
  actualMicroUsd: number | null;
  suggestions: AnalysisSuggestionView[];
}

/** `$0.0042`, `$1.20`: micro-dollars as money. */
export function formatMicroUsd(micro: number): string {
  const usd = micro / 1_000_000;
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
