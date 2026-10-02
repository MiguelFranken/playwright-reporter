/**
 * Visual comparisons for agents and the API: two captures, named once and
 * for good by a comparison id, measured twice — *raw*, before any rule left
 * areas out, and *effective*, with the checkpoint's active rules applied —
 * with the status of the pair, the test that produces the screen, and
 * whether the two captures are even comparable.
 *
 * The pixel measurement is shared by content hash (`image_diffs`); what this
 * module adds is the pair's identity: the same pixels mean different things
 * in different runs, and an agent debugging run 81 against run 80 must get
 * exactly those two images, never a baseline chosen for it.
 *
 * Nothing here decides anything about a review. A read may plan a
 * measurement nobody made yet (`dispatchMeasurements`), and that is all.
 */
import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { applicableRules, encodeComparisonId, labelRegions, unionArea, type CalculationState, type ComparisonStatus, type IgnoreRule, type RuleValidity, type VisualDiffRegion } from '@miguelfranken/ui/lib/visual-diff';
import { db } from '@/lib/db/drizzle';
import { reviewCaptures, reviewCheckpoints, runs, testResults, tests } from '@/lib/db/schema';
import type { LibraryRefKey } from '@miguelfranken/ui/lib/library';
import { libraryFlows } from '../library';
import { capturesById, capturesOfRun, type CaptureRecord } from '../queries';
import { diffDriver, diffsEnabled, dispatchMeasurements } from './measure';
import { EMPTY_RULES, rulesFor, type RuleSet } from './ignore';
import { diffSettingsFor, diffsFor, identityKey, pairKey, pairOf, type DiffPair, type DiffRecord, type Identity } from './lookup';
import { type VisualDiffSettings } from './settings';
import { CLAIM_TTL_MS, planPairs, type PlannedPair } from './store';

export interface RunInfo {
  id: string;
  number: number;
  branch: string | null;
  commit: string | null;
  sha: string | null;
  startedAt: Date;
}

/** Where a capture's screen comes from: the test and checkpoint an agent searches the repository for. */
export interface CaptureContext {
  captureId: string;
  run: RunInfo;
  test: { testId: string; title: string; titlePath: string[]; file: string; line: number | null; browser: string };
  checkpoint: { name: string; title: string | null; sequence: number; stepPath: string[]; url: string | null; pageTitle: string | null };
}

/** A screen (checkpoint and variant) as the base and the head each captured it; one side may be missing. */
export interface CapturePair {
  identity: Identity;
  base: CaptureRecord | null;
  head: CaptureRecord | null;
  /** In the library, a capture carried forward from an older run than the flow's newest. */
  baseCarriedForward: boolean;
  headCarriedForward: boolean;
}

export interface Compatibility {
  status: 'compatible' | 'incompatible' | 'unknown';
  differences: string[];
}

/** One pair with everything measured about it. */
export interface Comparison {
  comparisonId: string | null;
  /** The revision the numbers hold under: the rules and the settings. Changes when either does. */
  revision: string | null;
  pair: CapturePair;
  settings: VisualDiffSettings;
  rules: RuleSet;
  applied: IgnoreRule[];
  suspended: { rule: IgnoreRule; validity: RuleValidity }[];
  rawPair: DiffPair | null;
  effectivePair: DiffPair | null;
  raw: DiffRecord | null;
  effective: DiffRecord | null;
  comparisonStatus: ComparisonStatus;
  calculationState: CalculationState;
  compatibility: Compatibility;
  byteIdentical: boolean;
}

const runInfo = (r: { id: string; number: number; gitBranch: string | null; gitShortSha: string | null; gitSha: string | null; startedAt: Date }): RunInfo => ({
  id: r.id,
  number: r.number,
  branch: r.gitBranch,
  commit: r.gitShortSha ?? r.gitSha?.slice(0, 7) ?? null,
  sha: r.gitSha,
  startedAt: r.startedAt,
});

/** A run of the project by id, with what a comparison says about it. */
export async function runInfoFor(projectId: string, runIds: readonly string[]): Promise<Map<string, RunInfo>> {
  const ids = [...new Set(runIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: runs.id, number: runs.number, gitBranch: runs.gitBranch, gitShortSha: runs.gitShortSha, gitSha: runs.gitSha, startedAt: runs.startedAt, projectId: runs.projectId })
    .from(runs)
    .where(inArray(runs.id, ids));
  return new Map(rows.filter((r) => r.projectId === projectId).map((r) => [r.id, runInfo(r)]));
}

/** The test and checkpoint behind each capture. */
export async function contextFor(captures: readonly CaptureRecord[]): Promise<Map<string, CaptureContext>> {
  const out = new Map<string, CaptureContext>();
  const checkpointIds = [...new Set(captures.map((c) => c.checkpointId))];
  if (checkpointIds.length === 0) return out;
  const rows = await db
    .select({
      checkpointId: reviewCheckpoints.id,
      name: reviewCheckpoints.name,
      title: reviewCheckpoints.title,
      sequence: reviewCheckpoints.sequence,
      stepPath: reviewCheckpoints.stepPath,
      url: reviewCheckpoints.url,
      pageTitle: reviewCheckpoints.pageTitle,
      testId: tests.id,
      testTitle: tests.title,
      titlePath: tests.titlePath,
      file: tests.file,
      browser: tests.pwProject,
      line: testResults.line,
      run: { id: runs.id, number: runs.number, gitBranch: runs.gitBranch, gitShortSha: runs.gitShortSha, gitSha: runs.gitSha, startedAt: runs.startedAt },
    })
    .from(reviewCheckpoints)
    .innerJoin(tests, eq(tests.id, reviewCheckpoints.testId))
    .innerJoin(testResults, eq(testResults.id, reviewCheckpoints.testResultId))
    .innerJoin(runs, eq(runs.id, reviewCheckpoints.runId))
    .where(inArray(reviewCheckpoints.id, checkpointIds));
  const byCheckpoint = new Map(rows.map((r) => [r.checkpointId, r]));
  for (const c of captures) {
    const r = byCheckpoint.get(c.checkpointId);
    if (!r) continue;
    out.set(c.id, {
      captureId: c.id,
      run: runInfo(r.run),
      test: { testId: r.testId, title: r.testTitle, titlePath: r.titlePath, file: r.file, line: r.line ?? null, browser: r.browser },
      checkpoint: { name: r.name, title: r.title, sequence: r.sequence, stepPath: r.stepPath, url: r.url, pageTitle: r.pageTitle },
    });
  }
  return out;
}

/** Both captures of a comparison, when both are in the project. */
export async function resolvePair(projectId: string, baseCaptureId: string, headCaptureId: string): Promise<CapturePair | null> {
  const found = await capturesById([baseCaptureId.toLowerCase(), headCaptureId.toLowerCase()]);
  const base = found.find((c) => c.id === baseCaptureId.toLowerCase() && c.projectId === projectId) ?? null;
  const head = found.find((c) => c.id === headCaptureId.toLowerCase() && c.projectId === projectId) ?? null;
  if (!base || !head) return null;
  return { identity: { testId: head.testId, checkpointName: head.checkpointName, variant: head.variant }, base, head, baseCarriedForward: false, headCarriedForward: false };
}

/** Whether two captures were taken the same way: same variant, viewport and scale. Unknown without the metadata. */
export function compatibilityOf(base: CaptureRecord, head: CaptureRecord): Compatibility {
  const differences: string[] = [];
  if (base.variant !== head.variant) differences.push(`variant ${base.variant} vs ${head.variant}`);
  const known = base.viewportWidth != null && head.viewportWidth != null;
  if (known && (base.viewportWidth !== head.viewportWidth || base.viewportHeight !== head.viewportHeight)) differences.push(`viewport ${base.viewportWidth}×${base.viewportHeight} vs ${head.viewportWidth}×${head.viewportHeight}`);
  if (base.deviceScaleFactor != null && head.deviceScaleFactor != null && base.deviceScaleFactor !== head.deviceScaleFactor) differences.push(`device scale ${base.deviceScaleFactor}× vs ${head.deviceScaleFactor}×`);
  if (base.isMobile != null && head.isMobile != null && base.isMobile !== head.isMobile) differences.push(`${base.isMobile ? 'mobile' : 'desktop'} vs ${head.isMobile ? 'mobile' : 'desktop'} emulation`);
  if (base.fullPage != null && head.fullPage != null && base.fullPage !== head.fullPage) differences.push(`${base.fullPage ? 'full page' : 'viewport'} vs ${head.fullPage ? 'full page' : 'viewport'} capture`);
  if (differences.length) return { status: 'incompatible', differences };
  return { status: known || base.variant === head.variant ? 'compatible' : 'unknown', differences };
}

const asPlanned = (pair: DiffPair, base: CaptureRecord, head: CaptureRecord): PlannedPair => ({ pair: pair as PlannedPair['pair'], head: head.attachment, base: base.attachment });

/** `r3-1a2b3c4d5e6f`: the rule revision and a digest of the effective options. */
function revisionOf(rules: RuleSet, effectivePair: DiffPair | null, settings: VisualDiffSettings) {
  const digest = createHash('sha1').update(effectivePair?.optionsKey ?? `none;t=${settings.threshold}`).digest('hex').slice(0, 12);
  return `r${rules.revision}-${digest}`;
}

/**
 * Measures the pairs' comparisons as far as they are measured: the raw and
 * the effective measurement of each, and from them the status. Plans what is
 * missing when `plan` is set, and — with the inline driver — reads the new
 * numbers back, so a caller sees them in the same answer.
 */
export async function compare(pairs: readonly CapturePair[], opts: { plan?: boolean } = {}): Promise<Comparison[]> {
  const complete = pairs.filter((p): p is CapturePair & { base: CaptureRecord; head: CaptureRecord } => Boolean(p.base && p.head));
  const [settings, rules] = await Promise.all([diffSettingsFor(complete.map((p) => p.head.projectId)), rulesFor(complete.map((p) => p.identity))]);
  const build = (p: CapturePair & { base: CaptureRecord; head: CaptureRecord }) => {
    const s = settings.get(p.head.projectId)!;
    const set = rules.get(identityKey(p.identity)) ?? EMPTY_RULES;
    const { applied, suspended } = applicableRules(
      set.rules.filter((r) => r.active),
      { width: p.head.width, height: p.head.height },
    );
    const rawPair = pairOf(p.head, p.base, s, []);
    const effectivePair = applied.length ? pairOf(p.head, p.base, s, applied) : rawPair;
    return { s, set, applied, suspended, rawPair, effectivePair };
  };
  const prepared = complete.map((p) => ({ p, ...build(p) }));
  const lookup = async () => diffsFor(prepared.flatMap((x) => [x.rawPair, x.effectivePair].filter((d): d is NonNullable<typeof d> => Boolean(d))));
  let diffs = await lookup();

  if (opts.plan && diffsEnabled()) {
    const toPlan: PlannedPair[] = [];
    const stale = (d: DiffRecord | undefined) => !d || (d.status === 'pending' && Date.now() - new Date(d.claimedAt ?? d.createdAt).getTime() > CLAIM_TTL_MS);
    for (const x of prepared) {
      if (x.p.base.attachment.status !== 'uploaded' || x.p.head.attachment.status !== 'uploaded') continue;
      // Incompatible captures are measured too: a person may want the numbers, labelled as what they are.
      for (const pair of [x.rawPair, x.effectivePair]) {
        if (!pair) continue;
        if (stale(diffs.get(pairKey(pair.projectId, pair.baseSha256, pair.headSha256, pair.optionsKey)))) toPlan.push(asPlanned(pair, x.p.base, x.p.head));
      }
    }
    if (toPlan.length) {
      const plan = await planPairs(toPlan);
      if (plan.ids.length) {
        await dispatchMeasurements(plan.ids);
        if (diffDriver() === 'inline') diffs = await lookup();
      }
    }
  }

  const byId = new Map(prepared.map((x) => [x.p.head.id, x]));
  return pairs.map((pair): Comparison => {
    const x = pair.head ? byId.get(pair.head.id) : undefined;
    if (!x || !pair.base || !pair.head) {
      return {
        comparisonId: null,
        revision: null,
        pair,
        settings: settings.values().next().value ?? { threshold: 0.1, autoApprove: true, maxChangedPixels: 0, maxChangedPercent: 0 },
        rules: EMPTY_RULES,
        applied: [],
        suspended: [],
        rawPair: null,
        effectivePair: null,
        raw: null,
        effective: null,
        comparisonStatus: pair.head ? 'added' : 'not_captured',
        calculationState: 'not_needed',
        compatibility: { status: 'unknown', differences: [] },
        byteIdentical: false,
      };
    }
    const get = (d: DiffPair | null) => (d ? (diffs.get(pairKey(d.projectId, d.baseSha256, d.headSha256, d.optionsKey)) ?? null) : null);
    const raw = get(x.rawPair);
    const effective = x.effectivePair === x.rawPair ? raw : get(x.effectivePair);
    const compatibility = compatibilityOf(pair.base, pair.head);
    const byteIdentical = Boolean(pair.base.sha256 && pair.base.sha256 === pair.head.sha256);
    let comparisonStatus: ComparisonStatus;
    let calculationState: CalculationState;
    if (pair.base.attachment.status !== 'uploaded' || pair.head.attachment.status !== 'uploaded') {
      comparisonStatus = 'unavailable';
      calculationState = 'not_needed';
    } else if (byteIdentical || !x.rawPair) {
      comparisonStatus = 'identical';
      calculationState = 'not_needed';
    } else if (compatibility.status === 'incompatible') {
      comparisonStatus = 'incompatible';
      calculationState = raw ? (raw.status as CalculationState) : 'pending';
    } else if (raw?.status === 'done') {
      const sizeChanged = raw.baseWidth !== raw.headWidth || raw.baseHeight !== raw.headHeight;
      comparisonStatus = (raw.changedPixels ?? 0) === 0 && !sizeChanged ? 'identical' : 'changed';
      calculationState = 'done';
    } else {
      comparisonStatus = 'undetermined';
      calculationState = raw ? (raw.status as CalculationState) : diffsEnabled() ? 'pending' : 'failed';
    }
    return {
      comparisonId: encodeComparisonId(pair.base.id, pair.head.id),
      revision: revisionOf(x.set, x.effectivePair, x.s),
      pair,
      settings: x.s,
      rules: x.set,
      applied: x.applied,
      suspended: x.suspended,
      rawPair: x.rawPair,
      effectivePair: x.effectivePair,
      raw,
      effective,
      comparisonStatus,
      calculationState,
      compatibility,
      byteIdentical,
    };
  });
}

/** The numbers of a comparison: raw, what the rules left out, and what remains. */
export function numbersOf(c: Comparison) {
  const raw = c.raw?.status === 'done' ? c.raw : null;
  const effective = c.effective?.status === 'done' ? c.effective : null;
  const rawChanged = raw?.changedPixels ?? null;
  const effectiveChanged = effective?.changedPixels ?? null;
  const total = raw?.totalPixels ?? effective?.totalPixels ?? null;
  const ignored = rawChanged !== null && effectiveChanged !== null ? Math.max(0, rawChanged - effectiveChanged) : null;
  const sizes = {
    base: raw?.baseWidth && raw.baseHeight ? { width: raw.baseWidth, height: raw.baseHeight } : c.pair.base?.width && c.pair.base.height ? { width: c.pair.base.width, height: c.pair.base.height } : null,
    head: raw?.headWidth && raw.headHeight ? { width: raw.headWidth, height: raw.headHeight } : c.pair.head?.width && c.pair.head.height ? { width: c.pair.head.width, height: c.pair.head.height } : null,
  };
  return {
    rawChangedPixels: rawChanged,
    ignoredChangedPixels: ignored,
    effectiveChangedPixels: effectiveChanged ?? (c.applied.length === 0 ? rawChanged : null),
    totalPixels: total,
    rawChangedPercent: rawChanged !== null && total ? Math.round((rawChanged / total) * 100_000) / 1000 : null,
    effectiveChangedPercent: effectiveChanged !== null && total ? Math.round((effectiveChanged / total) * 100_000) / 1000 : null,
    ignoredAreaPixels: unionArea(c.applied),
    sizeChanged: raw ? raw.baseWidth !== raw.headWidth || raw.baseHeight !== raw.headHeight : effective ? effective.baseWidth !== effective.headWidth || effective.baseHeight !== effective.headHeight : null,
    contentMoved: Boolean((raw ?? effective)?.shift && (((raw ?? effective)!.shift!.inserted.length || (raw ?? effective)!.shift!.removed.length))),
    sizes,
    regionsComplete: raw ? !raw.regionsTruncated : effective ? !effective.regionsTruncated : null,
  };
}


/** The regions of a comparison, labelled: the raw measurement's by default, the effective one's on request. */
export function regionsOf(c: Comparison, policy: 'raw' | 'effective' = 'raw'): VisualDiffRegion[] {
  const row = policy === 'raw' ? (c.raw ?? c.effective) : (c.effective ?? c.raw);
  if (!row || row.status !== 'done') return [];
  const { sizes } = numbersOf(c);
  return labelRegions(row.regions ?? [], sizes, c.applied);
}

// ---------------------------------------------------------------- pairing two runs, two library references

type Ordered = CapturePair & { order: [string, string, number, string] };

function pairUp(baseCaptures: readonly (CaptureRecord & { carried?: boolean; order: [string, string, number] })[], headCaptures: readonly (CaptureRecord & { carried?: boolean; order: [string, string, number] })[]): Ordered[] {
  const base = new Map(baseCaptures.map((c) => [identityKey(c), c]));
  const head = new Map(headCaptures.map((c) => [identityKey(c), c]));
  const keys = [...new Set([...head.keys(), ...base.keys()])];
  return keys
    .map((key): Ordered => {
      const h = head.get(key) ?? null;
      const b = base.get(key) ?? null;
      const any = (h ?? b)!;
      return {
        identity: { testId: any.testId, checkpointName: any.checkpointName, variant: any.variant },
        base: b,
        head: h,
        baseCarriedForward: Boolean(b?.carried),
        headCarriedForward: Boolean(h?.carried),
        order: [...any.order, any.variant],
      };
    })
    .sort((a, b) => a.order[0].localeCompare(b.order[0]) || a.order[1].localeCompare(b.order[1]) || a.order[2] - b.order[2] || a.order[3].localeCompare(b.order[3]));
}

/** Every screen either run captured, paired by checkpoint and variant. */
export async function runPairs(baseRunId: string, headRunId: string): Promise<CapturePair[]> {
  const [base, head] = await Promise.all([capturesOfRun(baseRunId), capturesOfRun(headRunId)]);
  const all = [...base, ...head];
  const context = await contextFor(all);
  const withOrder = (list: typeof base) => list.map((c) => ({ ...c, order: [context.get(c.id)?.test.file ?? '', context.get(c.id)?.test.titlePath.join('\u0000') ?? '', c.checkpoint.sequence] as [string, string, number] }));
  return pairUp(withOrder(base), withOrder(head));
}

/** Every screen either library reference shows, paired by checkpoint and variant; carried-forward captures say so. */
export async function libraryPairs(projectId: string, baseKey: LibraryRefKey, headKey: LibraryRefKey): Promise<CapturePair[]> {
  const [base, head] = await Promise.all([libraryFlows(projectId, baseKey), libraryFlows(projectId, headKey)]);
  const flatten = (flows: Awaited<ReturnType<typeof libraryFlows>>) =>
    flows.flatMap((f) =>
      f.checkpoints.flatMap((cp) =>
        cp.captures.map((c) => ({ ...(c as CaptureRecord & { runNumber?: number }), carried: (c.runNumber ?? f.runNumber) !== f.runNumber, order: [f.file, f.titlePath.join('\u0000'), cp.sequence] as [string, string, number] })),
      ),
    );
  return pairUp(flatten(base), flatten(head));
}

/**
 * The run a run is compared with when nobody says: the newest finished run
 * with review captures that started before it, on the same branch when it
 * has one.
 */
export async function previousRunWithCaptures(projectId: string, head: { id: string; startedAt: Date; gitBranch: string | null }): Promise<RunInfo | null> {
  const [row] = await db
    .select({ id: runs.id, number: runs.number, gitBranch: runs.gitBranch, gitShortSha: runs.gitShortSha, gitSha: runs.gitSha, startedAt: runs.startedAt })
    .from(runs)
    .where(
      and(
        eq(runs.projectId, projectId),
        ne(runs.id, head.id),
        lt(runs.startedAt, head.startedAt),
        head.gitBranch ? eq(runs.gitBranch, head.gitBranch) : undefined,
        sql`exists (select 1 from ${reviewCaptures} rc where rc.run_id = ${runs.id})`,
      ),
    )
    .orderBy(desc(runs.startedAt))
    .limit(1);
  return row ? runInfo(row) : null;
}
