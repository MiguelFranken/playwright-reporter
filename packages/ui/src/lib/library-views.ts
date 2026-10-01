/**
 * Views of the library: where each screen stands in the review loop, and the
 * filters, grouping and order a person keeps as a view of their own.
 *
 * The loop: a reviewer comments on a screen or asks for a change (the screen
 * is *waiting for changes*); a developer changes the product and runs the
 * tests again, and the new capture differs from the one commented on (the
 * feedback is *ready to verify*); the reviewer compares the two and resolves
 * the comment. Nothing resolves on its own — a screen that changed is only
 * ready to be looked at again.
 *
 * Plain data and functions, read by the views, the app's URL parsing and its
 * saved views, so no JSX and no directive (see AGENTS.md, trap 2).
 */
import { buildReviewTree, compareVariants, flattenFolders, NEEDS_REVIEW, REVIEW_GROUPINGS, type ReviewCaptureView, type ReviewFlowView, type ReviewGrouping } from './review';
import { CASE_PRIORITIES, CASE_PRIORITY_LABELS, type CasePriority } from './test-cases';
import type { Tone } from './tone';
import { IGNORE_FILTER_LABELS, IGNORE_FILTERS, ignoreStates, type IgnoreFilter } from './visual-diff';

// ---------------------------------------------------------------- where a screen stands

/**
 * - `waiting`: open comments on the screen as it is now, or a change request
 *   on these pixels — a developer's to-do.
 * - `verify`: open comments made on an earlier version; the screen changed
 *   since — the reviewer's to-do.
 * - `needs-review`: differs from the approved screen, or nobody approved it,
 *   and nobody commented.
 * - `updated`: differs from the capture before it on this branch.
 * - `approved`: approved as it is, nothing open.
 */
export const LIBRARY_STATES = ['waiting', 'verify', 'needs-review', 'updated', 'approved'] as const;
export type LibraryState = (typeof LIBRARY_STATES)[number];

export const LIBRARY_STATE_LABELS: Record<LibraryState, string> = {
  waiting: 'Waiting for changes',
  verify: 'Ready to verify',
  'needs-review': 'Needs review',
  updated: 'Updated',
  approved: 'Approved',
};

export const LIBRARY_STATE_HINTS: Record<LibraryState, string> = {
  waiting: 'Open comments or a change request on the screen as it is now.',
  verify: 'Commented on an earlier version: the screen changed since. Compare and resolve.',
  'needs-review': 'Differs from the approved screen, or nobody approved it yet.',
  updated: 'Changed since the capture before it on this branch.',
  approved: 'Approved as it is, nothing open.',
};

export const LIBRARY_STATE_TONES: Record<LibraryState, Tone> = {
  waiting: 'danger',
  verify: 'info',
  'needs-review': 'warning',
  updated: 'warning',
  approved: 'success',
};

/** Open comment threads of a screen, by whether its pixels are the ones commented on. */
export interface FeedbackCounts {
  open: number;
  /** On the screen as it is now. */
  current: number;
  /** Placed on an earlier version: the screen changed since. */
  outdated: number;
}

export function feedbackCounts(captures: readonly Pick<ReviewCaptureView, 'threads'>[]): FeedbackCounts {
  const out = { open: 0, current: 0, outdated: 0 };
  for (const cap of captures)
    for (const t of cap.threads ?? []) {
      if (t.status !== 'open') continue;
      out.open++;
      if (t.placement === 'outdated') out.outdated++;
      else out.current++;
    }
  return out;
}

/** Every state a screen is in; a screen can be waiting and ready to verify at once. */
export function captureStates(cap: Pick<ReviewCaptureView, 'status' | 'threads' | 'previous' | 'request'>): Set<LibraryState> {
  const out = new Set<LibraryState>();
  const f = feedbackCounts([cap]);
  if (f.current > 0 || cap.status === 'changes_requested') out.add('waiting');
  // Changes asked for without a comment on an image this one replaced: no thread carries it over, the request does.
  if (f.outdated > 0 || (cap.request && !cap.request.onThisImage)) out.add('verify');
  if (f.open === 0 && NEEDS_REVIEW.includes(cap.status)) out.add('needs-review');
  if (f.open === 0 && cap.status === 'approved') out.add('approved');
  if (cap.previous && !cap.previous.same) out.add('updated');
  return out;
}

/** The states that decide a flow's place, most urgent first. `updated` says nothing about who acts next. */
const PRIMARY: readonly LibraryState[] = ['waiting', 'verify', 'needs-review', 'approved'];

/** A flow's most urgent state: what its chip says and where grouping by state puts it. */
export function flowState(flow: Pick<ReviewFlowView, 'checkpoints'>): Exclude<LibraryState, 'updated'> {
  const states = new Set(flow.checkpoints.flatMap((c) => c.captures.flatMap((cap) => [...captureStates(cap)])));
  return (PRIMARY.find((s) => states.has(s)) ?? 'approved') as Exclude<LibraryState, 'updated'>;
}

export function flowFeedback(flow: Pick<ReviewFlowView, 'checkpoints'>): FeedbackCounts {
  return feedbackCounts(flow.checkpoints.flatMap((c) => c.captures));
}

// ---------------------------------------------------------------- priority

const PRIORITY_RANK: Record<CasePriority, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

/** The highest priority of the test cases a flow's test is linked to; `none` without one. */
export function flowPriority(flow: Pick<ReviewFlowView, 'cases'>): CasePriority {
  let best: CasePriority = 'none';
  for (const c of flow.cases ?? []) if (c.priority && PRIORITY_RANK[c.priority] < PRIORITY_RANK[best]) best = c.priority;
  return best;
}

// ---------------------------------------------------------------- filters, grouping, order

export interface LibraryFilters {
  /** Flows with a screen in any of these states; empty for every flow. */
  states: LibraryState[];
  /** Flows whose highest linked priority is one of these; empty for every flow. */
  priorities: CasePriority[];
  /** Flows with a screen whose rules (areas left out) are in any of these states; empty (or absent, in older saved views) for every flow. */
  ignore?: IgnoreFilter[];
}

/** What the folders of a view are: the test case suites the flows' tests are linked to, or their spec files. */
export const LIBRARY_FOLDERS = REVIEW_GROUPINGS;
export type LibraryFolders = ReviewGrouping;
export const LIBRARY_FOLDERS_LABELS: Record<LibraryFolders, string> = { suite: 'Test case suites', file: 'Spec files' };
/** One folder, for a section heading's kind: `Suite`, `Spec file`. */
export const LIBRARY_FOLDER_LABELS: Record<LibraryFolders, string> = { suite: 'Suite', file: 'Spec file' };

/** How the flows are sectioned: by the view's folders, by review state, by priority, or not at all. */
export const LIBRARY_GROUPINGS = ['folder', 'state', 'priority', 'none'] as const;
export type LibraryGrouping = (typeof LIBRARY_GROUPINGS)[number];
export const LIBRARY_GROUPING_LABELS: Record<LibraryGrouping, string> = {
  folder: 'Folder',
  state: 'Review state',
  priority: 'Priority',
  none: 'No grouping',
};

export const LIBRARY_SORTS = ['journey', 'priority', 'urgency', 'recent', 'comments'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];
export const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = {
  journey: 'Suite and file order',
  priority: 'Priority',
  urgency: 'Most urgent first',
  recent: 'Recently captured',
  comments: 'Most open comments',
};

/** What a view is: its filters, its folders, how it groups and orders the flows, and optionally one variant. */
export interface LibraryViewConfig {
  filters: LibraryFilters;
  /** The folder tree beside the flows, and the sections when grouped by folder. */
  folders: LibraryFolders;
  group: LibraryGrouping;
  sort: LibrarySort;
  /** One variant (`mobile`), or every variant side by side. */
  variant: string | null;
}

export const DEFAULT_LIBRARY_VIEW: LibraryViewConfig = { filters: { states: [], priorities: [], ignore: [] }, folders: 'suite', group: 'folder', sort: 'journey', variant: null };

export const activeFilterCount = (f: LibraryFilters) => (f.states.length ? 1 : 0) + (f.priorities.length ? 1 : 0) + (f.ignore?.length ? 1 : 0);

/** Whether a screen's rules are in any of the wanted states. */
const matchesIgnore = (cap: Pick<ReviewCaptureView, 'ignore'>, wanted: readonly IgnoreFilter[]) => {
  if (!wanted.length) return true;
  const states = ignoreStates(cap.ignore);
  return wanted.some((w) => states.has(w));
};

/** Whether a flow passes the filters: every category that has values, any value within it. */
export function matchesLibraryFilters(flow: ReviewFlowView, filters: LibraryFilters): boolean {
  if (filters.priorities.length && !filters.priorities.includes(flowPriority(flow))) return false;
  if (filters.states.length) {
    const wanted = new Set(filters.states);
    if (!flow.checkpoints.some((c) => c.captures.some((cap) => [...captureStates(cap)].some((s) => wanted.has(s))))) return false;
  }
  const ignore = filters.ignore ?? [];
  if (ignore.length && !flow.checkpoints.some((c) => c.captures.some((cap) => matchesIgnore(cap, ignore)))) return false;
  return true;
}

/** The checkpoints of a flow that show why it passed the state filter: the rest of the journey stays, quieter. */
export function matchingCheckpointIds(flow: ReviewFlowView, filters: LibraryFilters): Set<string> | null {
  if (!filters.states.length && !filters.ignore?.length) return null;
  const wanted = new Set(filters.states);
  const ignore = filters.ignore ?? [];
  return new Set(
    flow.checkpoints
      .filter((c) => c.captures.some((cap) => (!wanted.size || [...captureStates(cap)].some((s) => wanted.has(s))) && matchesIgnore(cap, ignore)))
      .map((c) => c.id),
  );
}

const URGENCY: Record<Exclude<LibraryState, 'updated'>, number> = { waiting: 0, verify: 1, 'needs-review': 2, approved: 3 };

/** The newest capture of a flow, as an ISO date or run number: what "recently captured" orders by. */
const newestRun = (flow: ReviewFlowView) => Math.max(flow.runNumber ?? 0, ...flow.checkpoints.flatMap((c) => c.captures.map((cap) => cap.runNumber ?? 0)));

/** Flows in the view's order; ties keep the order they came in (suite, then file). */
export function sortLibraryFlows(flows: readonly ReviewFlowView[], sort: LibrarySort): ReviewFlowView[] {
  if (sort === 'journey') return [...flows];
  const score = (f: ReviewFlowView): number[] => {
    switch (sort) {
      case 'priority':
        return [PRIORITY_RANK[flowPriority(f)], URGENCY[flowState(f)]];
      case 'urgency':
        return [URGENCY[flowState(f)], PRIORITY_RANK[flowPriority(f)]];
      case 'recent':
        return [-newestRun(f)];
      case 'comments':
        return [-flowFeedback(f).open, URGENCY[flowState(f)]];
    }
  };
  return flows
    .map((f, i) => ({ f, i, s: score(f) }))
    .sort((a, b) => {
      for (let k = 0; k < a.s.length; k++) if (a.s[k] !== b.s[k]) return a.s[k] - b.s[k];
      return a.i - b.i;
    })
    .map((x) => x.f);
}

/** A section of the library: a heading and its flows. */
export interface LibrarySection {
  id: string;
  name: string;
  /** The heading, outermost first: a suite path, or one name. */
  path: string[];
  flows: ReviewFlowView[];
  /** The state or priority a section stands for, for its icon. */
  state?: Exclude<LibraryState, 'updated'>;
  priority?: CasePriority;
}

const STATE_SECTIONS: Exclude<LibraryState, 'updated'>[] = ['waiting', 'verify', 'needs-review', 'approved'];

/** The flows as sections: folders (suites or files), states, priorities, or one list. Empty sections are left out. */
export function groupLibraryFlows(flows: readonly ReviewFlowView[], group: LibraryGrouping, folders: LibraryFolders = 'suite'): LibrarySection[] {
  if (group === 'folder') {
    return flattenFolders(buildReviewTree(flows, folders)).map((f) => ({ id: f.id, name: f.name, path: f.path, flows: f.flows }));
  }
  if (group === 'none') return flows.length ? [{ id: 'all', name: 'All flows', path: ['All flows'], flows: [...flows] }] : [];
  if (group === 'state') {
    return STATE_SECTIONS.map((state) => ({ id: `state:${state}`, name: LIBRARY_STATE_LABELS[state], path: [LIBRARY_STATE_LABELS[state]], state, flows: flows.filter((f) => flowState(f) === state) })).filter((s) => s.flows.length);
  }
  return CASE_PRIORITIES.map((priority) => ({
    id: `priority:${priority}`,
    name: priority === 'none' ? 'No priority' : CASE_PRIORITY_LABELS[priority],
    path: [priority === 'none' ? 'No priority' : CASE_PRIORITY_LABELS[priority]],
    priority,
    flows: flows.filter((f) => flowPriority(f) === priority),
  })).filter((s) => s.flows.length);
}

/** How many flows are in each state and priority: what the filter menu and the summary count. */
export function libraryCounts(flows: readonly ReviewFlowView[]) {
  const states = Object.fromEntries(LIBRARY_STATES.map((s) => [s, 0])) as Record<LibraryState, number>;
  const priorities = Object.fromEntries(CASE_PRIORITIES.map((p) => [p, 0])) as Record<CasePriority, number>;
  const ignore = Object.fromEntries(IGNORE_FILTERS.map((s) => [s, 0])) as Record<IgnoreFilter, number>;
  let comments = 0;
  for (const f of flows) {
    const seen = new Set(f.checkpoints.flatMap((c) => c.captures.flatMap((cap) => [...captureStates(cap)])));
    for (const s of seen) states[s]++;
    const rules = new Set(f.checkpoints.flatMap((c) => c.captures.flatMap((cap) => [...ignoreStates(cap.ignore)])));
    for (const s of rules) ignore[s]++;
    priorities[flowPriority(f)]++;
    comments += flowFeedback(f).open;
  }
  return { states, priorities, ignore, comments, flows: flows.length };
}

export type LibraryCounts = ReturnType<typeof libraryCounts>;

// ---------------------------------------------------------------- the URL and saved views

/** An emptied filter, or every variant, in the URL: an empty value would be dropped from a query string. */
const EMPTY = '-';

/** The search params a view is written to; `view` names the saved or built-in view it started from. */
export const LIBRARY_VIEW_PARAMS = ['view', 'state', 'priority', 'ignore', 'folders', 'group', 'sort', 'variant'] as const;

const list = <T extends string>(allowed: readonly T[], raw: string | null | undefined): T[] =>
  raw
    ? [...new Set(raw.split(',').map((s) => s.trim()))].filter((s): s is T => (allowed as readonly string[]).includes(s)).sort((a, b) => allowed.indexOf(a) - allowed.indexOf(b))
    : [];
const oneOf = <T extends string>(allowed: readonly T[], raw: string | null | undefined, fallback: T): T => ((allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback);

/**
 * Grouping and folders from what a link or a stored view says. Before views
 * had their own folders, `group` was `suite` or `file`: that reads as grouping
 * by folder, with those folders.
 */
function readLayout(group: string | null | undefined, folders: string | null | undefined, base: Pick<LibraryViewConfig, 'group' | 'folders'>): Pick<LibraryViewConfig, 'group' | 'folders'> {
  const legacy = group === 'suite' || group === 'file' ? group : null;
  return {
    group: legacy ? 'folder' : oneOf(LIBRARY_GROUPINGS, group, base.group),
    folders: oneOf(LIBRARY_FOLDERS, folders, legacy ?? base.folders),
  };
}

/** A view's settings from the URL; what the URL does not say comes from `base` (the view it started from). */
export function viewConfigFromParams(get: (name: string) => string | null, base: LibraryViewConfig = DEFAULT_LIBRARY_VIEW): LibraryViewConfig {
  const has = (name: string) => get(name) !== null;
  return {
    filters: {
      states: has('state') ? list(LIBRARY_STATES, get('state')) : base.filters.states,
      priorities: has('priority') ? list(CASE_PRIORITIES, get('priority')) : base.filters.priorities,
      ignore: has('ignore') ? list(IGNORE_FILTERS, get('ignore')) : (base.filters.ignore ?? []),
    },
    ...readLayout(get('group'), get('folders'), base),
    sort: oneOf(LIBRARY_SORTS, get('sort'), base.sort),
    variant: has('variant') ? (get('variant') && get('variant') !== EMPTY ? get('variant') : null) : base.variant,
  };
}

/**
 * The params that say how `config` differs from `base`, the rest cleared: a
 * view's link carries only what someone changed. An emptied filter (and
 * "every variant") is written as `-`, so it outlasts a view that sets one.
 */
export function viewConfigToParams(config: LibraryViewConfig, base: LibraryViewConfig = DEFAULT_LIBRARY_VIEW): Record<(typeof LIBRARY_VIEW_PARAMS)[number], string | null> {
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  return {
    view: null,
    state: same(config.filters.states, base.filters.states) ? null : config.filters.states.join(',') || EMPTY,
    priority: same(config.filters.priorities, base.filters.priorities) ? null : config.filters.priorities.join(',') || EMPTY,
    ignore: same(config.filters.ignore ?? [], base.filters.ignore ?? []) ? null : (config.filters.ignore ?? []).join(',') || EMPTY,
    folders: config.folders === base.folders ? null : config.folders,
    group: config.group === base.group ? null : config.group,
    sort: config.sort === base.sort ? null : config.sort,
    variant: config.variant === base.variant ? null : (config.variant ?? EMPTY),
  };
}

export function sameViewConfig(a: LibraryViewConfig, b: LibraryViewConfig): boolean {
  return JSON.stringify(normalizeViewConfig(a)) === JSON.stringify(normalizeViewConfig(b));
}

/** A stored or posted view's settings, with anything unknown dropped: saved views outlive the vocabulary they were saved with. */
export function normalizeViewConfig(raw: unknown): LibraryViewConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const f = (r.filters && typeof r.filters === 'object' ? r.filters : {}) as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').join(',') : null);
  return {
    filters: { states: list(LIBRARY_STATES, strings(f.states)), priorities: list(CASE_PRIORITIES, strings(f.priorities)), ignore: list(IGNORE_FILTERS, strings(f.ignore)) },
    ...readLayout(typeof r.group === 'string' ? r.group : null, typeof r.folders === 'string' ? r.folders : null, DEFAULT_LIBRARY_VIEW),
    sort: oneOf(LIBRARY_SORTS, typeof r.sort === 'string' ? r.sort : null, DEFAULT_LIBRARY_VIEW.sort),
    variant: typeof r.variant === 'string' && r.variant.trim() ? r.variant.trim().slice(0, 64) : null,
  };
}

/** A view the library lists: built in, or saved by the person looking. */
export interface LibraryViewDef {
  /** `all`, `to-fix`…, or a saved view's id. */
  id: string;
  name: string;
  description?: string | null;
  config: LibraryViewConfig;
  builtIn?: boolean;
}

export const LIBRARY_VIEW_NAME_MAX = 60;
export const MAX_SAVED_VIEWS = 50;

const view = (id: string, name: string, description: string, config: Partial<Omit<LibraryViewConfig, 'filters'>> & { filters?: Partial<LibraryFilters> }): LibraryViewDef => ({
  id,
  name,
  description,
  builtIn: true,
  config: { ...DEFAULT_LIBRARY_VIEW, ...config, filters: { ...DEFAULT_LIBRARY_VIEW.filters, ...config.filters } },
});

/**
 * The views everybody has: every flow, and one per step of the loop — what
 * a developer has to change, what a reviewer has to look at again.
 */
export const BUILT_IN_VIEWS: readonly LibraryViewDef[] = [
  view('all', 'All flows', 'Every flow the branch shows, by test case suite.', {}),
  view('feedback', 'Open feedback', 'Every flow with an open comment or change request, grouped by where it stands.', { filters: { states: ['waiting', 'verify'] }, group: 'state', sort: 'priority' }),
  view('to-fix', 'To fix', 'Comments and change requests on screens as they are now, highest priority first.', { filters: { states: ['waiting'] }, group: 'priority', sort: 'priority' }),
  view('to-verify', 'To verify', 'Screens that changed since somebody commented: compare, then resolve.', { filters: { states: ['verify'] }, sort: 'recent' }),
  view('to-review', 'To review', 'Updated screens, screens nobody approved, and feedback to verify.', { filters: { states: ['verify', 'needs-review', 'updated'] }, sort: 'recent' }),
];

export const builtInView = (id: string | null | undefined) => BUILT_IN_VIEWS.find((v) => v.id === id) ?? null;

/** In words, for a view's tooltip and the MCP tool: `Ready to verify · High, Critical · by priority`. */
export function describeViewConfig(config: LibraryViewConfig): string {
  const parts: string[] = [];
  if (config.filters.states.length) parts.push(config.filters.states.map((s) => LIBRARY_STATE_LABELS[s]).join(' or '));
  if (config.filters.priorities.length) parts.push(`priority ${config.filters.priorities.map((p) => CASE_PRIORITY_LABELS[p]).join(' or ')}`);
  if (config.filters.ignore?.length) parts.push(config.filters.ignore.map((s) => IGNORE_FILTER_LABELS[s].toLowerCase()).join(' or '));
  if (config.variant) parts.push(config.variant);
  if (config.folders !== DEFAULT_LIBRARY_VIEW.folders) parts.push(`by ${LIBRARY_FOLDER_LABELS[config.folders].toLowerCase()}`);
  if (config.group !== DEFAULT_LIBRARY_VIEW.group) parts.push(`grouped by ${LIBRARY_GROUPING_LABELS[config.group].toLowerCase()}`);
  if (config.sort !== DEFAULT_LIBRARY_VIEW.sort) parts.push(`${LIBRARY_SORT_LABELS[config.sort].toLowerCase()}`);
  return parts.join(' · ') || 'Every flow';
}

/** Variants a view can pick, in display order. */
export const sortedVariants = (variants: Iterable<string>) => [...new Set(variants)].sort(compareVariants);
