/**
 * Visual differences between two runs (or two library references) for
 * assistants: which screens changed although every test may be green, how
 * much before and after the checkpoint's rules left areas out, where — as
 * numbered regions an agent can ask for one by one — and the images
 * themselves in the mode that reads best: the head boxed and numbered, base
 * and head of one region side by side, the painted changes, the mask, the
 * colour difference, or the two faded over each other.
 *
 * Every answer names the exact pair (base capture, head capture, their runs)
 * so the agent can follow the screen to the test and code that produce it.
 * Nothing here decides anything about a review: a read may measure a pair
 * nobody measured yet, and that is all.
 */
import type { ImageContent } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { checkpointLabel } from '@miguelfranken/ui/lib/review';
import { libraryRefParam, type LibraryRefKey } from '@miguelfranken/ui/lib/library';
import {
  COMPARISON_FILTERS,
  COMPARISON_STATUSES,
  CALCULATION_STATES,
  IGNORE_FILTERS,
  MASK_POLICIES,
  VISUAL_DIFF_MODES,
  VISUAL_DIFF_SCOPES,
  decodeComparisonId,
  ignoreStates,
  matchesComparisonFilter,
  type IgnoreSummary,
} from '@miguelfranken/ui/lib/visual-diff';
import { signVisualRenderPath } from '@/lib/auth/artifact-url';
import { baseUrl } from '@/lib/auth/config';
import { defaultBranch } from '@/lib/db/queries/mcp';
import { defaultLibraryRef } from '@/lib/review/library';
import {
  compare,
  contextFor,
  libraryPairs,
  numbersOf,
  previousRunWithCaptures,
  regionsOf,
  resolvePair,
  runInfoFor,
  runPairs,
  type CapturePair,
  type Comparison,
  type RunInfo,
} from '@/lib/review/diff/comparison';
import { DEFAULT_MAX_IMAGES, MAX_IMAGES, planImages, specQuery, describeMode, type PlannedImage } from '@/lib/review/diff/image-plan';
import { DEFAULT_CONTEXT_PADDING, loadSource, render, RenderError, type RenderContext, type Rendered } from '@/lib/review/diff/render';
import { getStorage } from '@/lib/storage';
import { artifactUrlTtlSeconds, inlineImageMaxBytes } from '../config';
import { invalid, notFound, ToolError } from '../errors';
import { branchParam, commonParams, cursorParam, isUuid, nextCursor, readPage, runParam } from '../params';
import { defineTool, output } from '../registry';
import { link } from '../render/markdown';
import { resolveRun } from '../resolve';
import { reviewUrl } from './review';

// ---------------------------------------------------------------- shared shapes

const rectOut = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });

const sideOut = z
  .object({
    captureId: z.string(),
    run: z.number().nullable(),
    carriedForward: z.boolean().describe('Library: this capture comes from an older run than the flow’s newest (the newest did not capture the screen).'),
    available: z.boolean().describe('The image is stored and can be read.'),
  })
  .nullable();

const regionOut = z.object({
  id: z.string().describe('Stable within a revision: pass it to get_visual_diff_image.'),
  label: z.string().describe('D1, D2…: the number drawn on the annotated image. Comment threads keep their own #n numbers.'),
  kind: z.enum(['change', 'added-area', 'removed-area']),
  headRect: rectOut.nullable().describe('In the head image’s pixels; null for area only the base has.'),
  baseRect: rectOut.nullable().describe('The same rectangle in the base image, when it lies within it.'),
  rawChangedPixels: z.number(),
  ignore: z.enum(['none', 'partial', 'full']).describe('How the active rules touch the region.'),
  ignoredBy: z.array(z.string()).describe('Rule ids.'),
});

const ignoreOut = z.object({
  active: z.number(),
  ever: z.boolean(),
  applied: z.number(),
  suspended: z.number().describe('Active rules that do not fit this image (another size) and were not applied.'),
  revision: z.number(),
  rawChangedPixels: z.number().nullable(),
  suppressedPixels: z.number().nullable(),
  states: z.array(z.enum(IGNORE_FILTERS)),
});

function ignoreSummaryOf(c: Comparison): IgnoreSummary {
  const n = numbersOf(c);
  return {
    active: c.rules.rules.filter((r) => r.active).length,
    ever: c.rules.ever,
    applied: c.applied.length,
    suspended: c.suspended.length,
    revision: c.rules.revision,
    rawChangedPixels: n.rawChangedPixels,
    suppressedPixels: n.ignoredChangedPixels,
  };
}

const ignoreOutOf = (c: Comparison): z.infer<typeof ignoreOut> => {
  const s = ignoreSummaryOf(c);
  return { ...s, states: [...ignoreStates(s)] };
};

const sideOutOf = (capture: CapturePair['base'], carried: boolean, runs: Map<string, RunInfo>): z.infer<typeof sideOut> =>
  capture ? { captureId: capture.id, run: runs.get(capture.runId)?.number ?? null, carriedForward: carried, available: capture.attachment.status === 'uploaded' } : null;

async function resolveComparison(projectId: string, args: { comparison?: string; base?: string; head?: string }): Promise<CapturePair> {
  let baseId: string | undefined;
  let headId: string | undefined;
  if (args.comparison) {
    const decoded = decodeComparisonId(args.comparison.trim());
    if (!decoded) throw new ToolError('INVALID_COMPARISON', `"${args.comparison}" is not a comparison id.`, 'Use the comparisonId from list_visual_diffs, or pass base and head capture ids.');
    baseId = decoded.baseCaptureId;
    headId = decoded.headCaptureId;
  } else {
    if (!args.base || !args.head) throw invalid('Pass "comparison", or both "base" and "head" capture ids.');
    if (!isUuid(args.base) || !isUuid(args.head)) throw invalid('"base" and "head" are capture ids.');
    baseId = args.base;
    headId = args.head;
  }
  const pair = await resolvePair(projectId, baseId, headId);
  if (!pair) throw notFound('That comparison is not in this project: one of its captures was deleted, or belongs elsewhere.', 'Call list_visual_diffs for current comparison ids.');
  return pair;
}

const retryAfter = (c: Comparison) => (c.calculationState === 'pending' ? 2000 : null);

// ---------------------------------------------------------------- list_visual_diffs

const listInput = z.object({
  ...commonParams,
  headRun: runParam.optional().describe('The run looked at (default: the latest run with review captures). Exactly one of the run pair or the library pair.'),
  baseRun: runParam.optional().describe('The run compared against (default: the newest earlier run with captures on the head run’s branch).'),
  headBranch: branchParam.describe('Library mode: the branch looked at, every screen as its newest run shows it.'),
  headPullRequest: z.number().int().positive().optional().describe('Library mode: a pull request looked at.'),
  baseBranch: z.string().optional().describe('Library mode: the branch compared against (default: the library’s default reference).'),
  basePullRequest: z.number().int().positive().optional(),
  status: z.enum(COMPARISON_FILTERS).optional().describe('changed (default: changed and not measured yet), all, identical, undetermined, added, not_captured or incompatible.'),
  test: z.string().optional().describe('Part of a test title or file.'),
  variant: z.string().optional().describe('Only this variant, e.g. "desktop".'),
  ignore: z.enum(IGNORE_FILTERS).optional().describe('Only screens whose rules (areas left out) are: active, ever, applied, suppressed, fully-suppressed or needs-review.'),
  limit: z.number().int().min(1).max(100).optional().describe('Rows per page (default 50).'),
  cursor: cursorParam,
});

const rowOut = z.object({
  comparisonId: z.string().nullable().describe('Null when one side has no capture (added, not_captured).'),
  test: z.object({ testId: z.string(), title: z.string(), file: z.string(), line: z.number().nullable(), browser: z.string() }),
  checkpoint: z.object({ name: z.string(), title: z.string(), order: z.number() }),
  variant: z.string(),
  base: sideOut,
  head: sideOut,
  comparisonStatus: z.enum(COMPARISON_STATUSES),
  calculationState: z.enum(CALCULATION_STATES),
  compatibility: z.enum(['compatible', 'incompatible', 'unknown']),
  rawChangedPixels: z.number().nullable().describe('Before any rule left areas out.'),
  effectiveChangedPixels: z.number().nullable().describe('With the active rules applied: what the review counts.'),
  ignoredChangedPixels: z.number().nullable(),
  rawChangedPercent: z.number().nullable(),
  regions: z.number().nullable(),
  sizeChanged: z.boolean().nullable(),
  ignore: ignoreOut,
  reviewUrl: z.string().nullable(),
});

const listOutput = output({
  project: z.string(),
  mode: z.enum(['runs', 'library']),
  base: z.object({ kind: z.string(), run: z.number().nullable(), reference: z.string().nullable(), id: z.string().nullable() }),
  head: z.object({ kind: z.string(), run: z.number().nullable(), reference: z.string().nullable(), id: z.string().nullable() }),
  counts: z.object({ total: z.number(), changed: z.number(), identical: z.number(), undetermined: z.number(), added: z.number(), not_captured: z.number(), incompatible: z.number(), unavailable: z.number(), pending: z.number(), returned: z.number() }),
  comparisons: z.array(rowOut),
  nextCursor: z.string().nullable(),
  note: z.string().nullable(),
});

export const listVisualDiffs = defineTool({
  name: 'list_visual_diffs',
  title: 'List visual differences between two runs',
  toolset: 'core',
  description:
    'Which review screens look different between two runs (or two branches / pull requests in the library), test by test — even when every test passed. For each screen: the exact base and head captures, whether they are identical, changed, not measured yet, only in one run or incompatible, the changed pixels before and after the checkpoint’s rules left areas out, and a comparisonId to pass to get_visual_diff and get_visual_diff_image. Measures pairs nobody measured yet; pending ones say so (ask again). Decides nothing.',
  input: listInput,
  output: listOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    const libraryMode = Boolean(args.headBranch || args.headPullRequest || args.baseBranch || args.basePullRequest);
    const runMode = args.headRun !== undefined || args.baseRun !== undefined;
    if (libraryMode && runMode) throw invalid('Pass either runs (headRun/baseRun) or library references (headBranch/headPullRequest and baseBranch/basePullRequest), not both.');

    let pairs: CapturePair[];
    let base: z.infer<typeof listOutput>['base'];
    let head: z.infer<typeof listOutput>['head'];
    let snapshot: unknown;
    let note: string | null = null;
    if (libraryMode) {
      if (args.headBranch && args.headPullRequest) throw invalid('Pass "headBranch" or "headPullRequest", not both.');
      if (args.baseBranch && args.basePullRequest) throw invalid('Pass "baseBranch" or "basePullRequest", not both.');
      const headKey: LibraryRefKey | null = args.headPullRequest ? { kind: 'pull_request', prNumber: args.headPullRequest } : args.headBranch ? { kind: 'branch', branch: args.headBranch } : null;
      if (!headKey) throw invalid('Library mode needs "headBranch" or "headPullRequest".');
      const branch = await defaultBranch(project.project.id, project.project.settings);
      const baseKey: LibraryRefKey = args.basePullRequest ? { kind: 'pull_request', prNumber: args.basePullRequest } : args.baseBranch ? { kind: 'branch', branch: args.baseBranch } : await defaultLibraryRef(project.project.id, branch);
      if (libraryRefParam(baseKey) === libraryRefParam(headKey)) throw invalid('Base and head are the same reference. Pass a baseBranch or basePullRequest to compare against.');
      pairs = await libraryPairs(project.project.id, baseKey, headKey);
      base = { kind: 'library', run: null, reference: libraryRefParam(baseKey), id: null };
      head = { kind: 'library', run: null, reference: libraryRefParam(headKey), id: null };
      // The snapshot is the set of captures the references resolved to: a newer run must not move the pages under a cursor.
      snapshot = pairs.map((p) => [p.base?.id ?? '', p.head?.id ?? '']);
    } else {
      const headRun = await resolveRun(project, args.headRun ?? 'latest');
      let baseRun: RunInfo | null;
      if (args.baseRun !== undefined) {
        const r = await resolveRun(project, args.baseRun);
        baseRun = { id: r.id, number: r.number, branch: r.gitBranch, commit: r.gitShortSha, sha: r.gitSha, startedAt: r.startedAt };
      } else {
        baseRun = await previousRunWithCaptures(project.project.id, { id: headRun.id, startedAt: headRun.startedAt, gitBranch: headRun.gitBranch });
        if (!baseRun) throw notFound(`No earlier run with review captures${headRun.gitBranch ? ` on ${headRun.gitBranch}` : ''} to compare run #${headRun.number} with.`, 'Pass baseRun explicitly.');
        note = `Base run chosen by default: #${baseRun.number}, the newest earlier run with captures${headRun.gitBranch ? ` on ${headRun.gitBranch}` : ''}.`;
      }
      if (baseRun.id === headRun.id) throw invalid('Base and head are the same run.');
      pairs = await runPairs(baseRun.id, headRun.id);
      base = { kind: 'run', run: baseRun.number, reference: null, id: baseRun.id };
      head = { kind: 'run', run: headRun.number, reference: null, id: headRun.id };
      snapshot = [baseRun.id, headRun.id];
    }

    const comparisons = await compare(pairs, { plan: true });
    const captures = pairs.flatMap((p) => [p.base, p.head].filter((c): c is NonNullable<typeof c> => Boolean(c)));
    const [context, runs] = await Promise.all([contextFor(captures), runInfoFor(project.project.id, captures.map((c) => c.runId))]);
    const q = args.test?.toLowerCase();
    const filtered = comparisons.filter((c) => {
      const any = (c.pair.head ?? c.pair.base)!;
      const t = context.get(any.id);
      if (args.variant && any.variant !== args.variant) return false;
      if (q && !(t && (t.test.title.toLowerCase().includes(q) || t.test.titlePath.join(' ').toLowerCase().includes(q) || t.test.file.toLowerCase().includes(q)))) return false;
      if (args.ignore && !ignoreStates(ignoreSummaryOf(c)).has(args.ignore)) return false;
      return matchesComparisonFilter(c.comparisonStatus, args.status ?? 'changed');
    });
    const counts = { total: filtered.length, changed: 0, identical: 0, undetermined: 0, added: 0, not_captured: 0, incompatible: 0, unavailable: 0, pending: 0, returned: 0 };
    for (const c of filtered) {
      counts[c.comparisonStatus]++;
      if (c.calculationState === 'pending') counts.pending++;
    }
    const filters = { snapshot, status: args.status ?? 'changed', test: args.test, variant: args.variant, ignore: args.ignore };
    const page = readPage('list_visual_diffs', filters, { limit: args.limit ?? 50, cursor: args.cursor });
    const rows = filtered.slice(page.offset, page.offset + page.limit).map((c): z.infer<typeof rowOut> => {
      const any = (c.pair.head ?? c.pair.base)!;
      const t = context.get(any.id)!;
      const n = numbersOf(c);
      const headRunNumber = c.pair.head ? (runs.get(c.pair.head.runId)?.number ?? null) : null;
      return {
        comparisonId: c.comparisonId,
        test: { testId: t.test.testId, title: t.test.titlePath.join(' › ') || t.test.title, file: t.test.file, line: t.test.line, browser: t.test.browser },
        checkpoint: { name: t.checkpoint.name, title: checkpointLabel(t.checkpoint.name, t.checkpoint.title), order: t.checkpoint.sequence + 1 },
        variant: any.variant,
        base: sideOutOf(c.pair.base, c.pair.baseCarriedForward, runs),
        head: sideOutOf(c.pair.head, c.pair.headCarriedForward, runs),
        comparisonStatus: c.comparisonStatus,
        calculationState: c.calculationState,
        compatibility: c.compatibility.status,
        rawChangedPixels: n.rawChangedPixels,
        effectiveChangedPixels: n.effectiveChangedPixels,
        ignoredChangedPixels: n.ignoredChangedPixels,
        rawChangedPercent: n.rawChangedPercent,
        regions: c.raw?.status === 'done' ? (c.raw.regions?.length ?? 0) : null,
        sizeChanged: n.sizeChanged,
        ignore: ignoreOutOf(c),
        reviewUrl: c.pair.head && headRunNumber ? reviewUrl(project.links, headRunNumber, c.pair.head) : null,
      };
    });
    counts.returned = rows.length;
    const pendingNote = counts.pending ? `${counts.pending} comparison${counts.pending === 1 ? ' is' : 's are'} still being measured: ask again in a moment.` : null;
    const data: z.infer<typeof listOutput> = {
      project: project.ref,
      mode: libraryMode ? 'library' : 'runs',
      base,
      head,
      counts,
      comparisons: rows,
      nextCursor: nextCursor('list_visual_diffs', filters, page, filtered.length),
      note: [note, pendingNote].filter(Boolean).join(' ') || null,
    };
    return {
      data,
      render(md, d) {
        const name = (s: typeof d.base) => (s.kind === 'run' ? `run #${s.run}` : s.reference);
        md.heading(`Visual differences: ${name(d.head)} against ${name(d.base)}`, 2);
        md.line(`${d.counts.total} screen${d.counts.total === 1 ? '' : 's'} match the filter: ${d.counts.changed} changed, ${d.counts.identical} identical, ${d.counts.undetermined} not measured yet, ${d.counts.added} only in head, ${d.counts.not_captured} not captured by head, ${d.counts.incompatible} incompatible${d.counts.unavailable ? `, ${d.counts.unavailable} unavailable` : ''}. Showing ${d.counts.returned}${d.nextCursor ? ' — more with nextCursor' : ''}.`);
        if (d.note) md.line(d.note);
        if (d.comparisons.length === 0) {
          md.line((args.status ?? 'changed') === 'changed' ? 'No screen looks different: every pair is identical (or nothing is comparable). Pass status "all" to see every pair.' : 'Nothing matches.');
          return;
        }
        md.table(
          ['Test', 'Checkpoint', 'Variant', 'Status', 'Raw px', 'Effective px', 'Regions', 'Comparison id'],
          d.comparisons.map((c) => [c.test.title, `${c.checkpoint.order}. ${c.checkpoint.title}`, c.variant, c.comparisonStatus + (c.calculationState === 'pending' ? ' (measuring)' : '') + (c.compatibility === 'incompatible' ? ' ⚠' : ''), c.rawChangedPixels, c.effectiveChangedPixels, c.regions, c.comparisonId ?? '—']),
        );
        md.line('Next: get_visual_diff with a comparisonId for its regions and context, then get_visual_diff_image for the pictures. A changed screen is evidence to look at, not a defect: names, dates and ids that differ between runs are as common as real regressions.');
      },
    };
  },
});

// ---------------------------------------------------------------- get_visual_diff

const getInput = z.object({
  ...commonParams,
  comparison: z.string().optional().describe('The comparisonId from list_visual_diffs.'),
  base: z.string().optional().describe('Instead of comparison: the capture id compared against.'),
  head: z.string().optional().describe('Instead of comparison: the capture id looked at.'),
  policy: z.enum(MASK_POLICIES).optional().describe('Whose regions to list: raw (default, before any rule left areas out) or effective (with the active rules).'),
  regionCursor: z.string().optional().describe('From a previous answer, for the next page of regions.'),
  limit: z.number().int().min(1).max(200).optional().describe('Regions per page (default 25).'),
});

const runOut = z.object({ run: z.number(), branch: z.string().nullable(), commit: z.string().nullable(), startedAt: z.string() }).nullable();

const getOutput = output({
  project: z.string(),
  comparisonId: z.string(),
  revision: z.string().describe('The rules and settings the numbers were measured under. Pass it to get_visual_diff_image to be told if it changed.'),
  base: z.object({ captureId: z.string(), run: runOut, available: z.boolean(), imageUrl: z.string().nullable(), width: z.number().nullable(), height: z.number().nullable() }),
  head: z.object({ captureId: z.string(), run: runOut, available: z.boolean(), imageUrl: z.string().nullable(), width: z.number().nullable(), height: z.number().nullable() }),
  test: z.object({ testId: z.string(), title: z.string(), titlePath: z.array(z.string()), file: z.string(), line: z.number().nullable(), browser: z.string() }),
  checkpoint: z.object({ name: z.string().describe('The key the test passes to its capture helper: search the spec for it.'), title: z.string(), order: z.number(), stepPath: z.array(z.string()), url: z.string().nullable(), pageTitle: z.string().nullable() }),
  variant: z.string(),
  capture: z.object({ viewport: z.string().nullable(), deviceScaleFactor: z.number().nullable(), fullPage: z.boolean().nullable(), isMobile: z.boolean().nullable() }),
  compatibility: z.object({ status: z.enum(['compatible', 'incompatible', 'unknown']), differences: z.array(z.string()) }),
  comparisonStatus: z.enum(COMPARISON_STATUSES),
  calculationState: z.enum(CALCULATION_STATES),
  byteIdentical: z.boolean(),
  rawChangedPixels: z.number().nullable(),
  ignoredChangedPixels: z.number().nullable(),
  effectiveChangedPixels: z.number().nullable(),
  totalPixels: z.number().nullable().describe('The area both images cover together: the denominator of the percentages.'),
  rawChangedPercent: z.number().nullable(),
  effectiveChangedPercent: z.number().nullable(),
  ignoredAreaPixels: z.number().describe('The area of the active rules, each pixel once.'),
  sizeChanged: z.boolean().nullable(),
  contentMoved: z.boolean(),
  threshold: z.number(),
  ignoreRuleRevision: z.number(),
  rules: z.object({ applied: z.array(z.object({ id: z.string(), rect: rectOut, reason: z.string().nullable(), source: z.string() })), suspended: z.array(z.object({ id: z.string(), rect: rectOut, why: z.string() })) }),
  regions: z.array(regionOut),
  regionsComplete: z.boolean().nullable().describe('False when the measurement kept only the largest regions.'),
  nextRegionCursor: z.string().nullable(),
  retryAfterMs: z.number().nullable().describe('Set while the measurement runs: ask again after this.'),
  reviewUrl: z.string().nullable(),
  interpretation: z.null().describe('Always null: the measurement states no cause. Analyses are separate.'),
  note: z.string().nullable(),
});

export const getVisualDiff = defineTool({
  name: 'get_visual_diff',
  title: 'Get a visual difference',
  toolset: 'core',
  description:
    'One visual comparison in detail: the exact base and head captures and their runs, the test and checkpoint that produce the screen (file, title path, checkpoint key, step, URL), how the two were captured, and the measurement — raw changed pixels, what the checkpoint’s rules left out, what remains — with every changed region as D1, D2… (stable ids, rectangles in image pixels, which rules touch it). Pass a region id to get_visual_diff_image to look at it. States no cause: a changed name is an observation, not yet randomness.',
  input: getInput,
  output: getOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    const pair = await resolveComparison(project.project.id, args);
    const [c] = await compare([pair], { plan: true });
    const policy = args.policy ?? 'raw';
    const regions = regionsOf(c, policy);
    const page = readPage('get_visual_diff', { comparison: c.comparisonId, policy, revision: c.revision }, { limit: args.limit ?? 25, cursor: args.regionCursor });
    const [context, runs] = await Promise.all([contextFor([pair.head!, pair.base!]), runInfoFor(project.project.id, [pair.head!.runId, pair.base!.runId])]);
    const t = context.get(pair.head!.id)!;
    const n = numbersOf(c);
    const canSeeImages = project.can({ artifact: ['read'] });
    const runOf = (id: string): z.infer<typeof runOut> => {
      const r = runs.get(id);
      return r ? { run: r.number, branch: r.branch, commit: r.commit, startedAt: r.startedAt.toISOString() } : null;
    };
    const side = (cap: NonNullable<CapturePair['head']>) => ({
      captureId: cap.id,
      run: runOf(cap.runId),
      available: cap.attachment.status === 'uploaded',
      imageUrl: canSeeImages && cap.attachment.status === 'uploaded' ? ctx.artifactUrl(cap.attachment.id) : null,
      width: cap.width,
      height: cap.height,
    });
    const notes = [
      c.calculationState === 'pending' ? 'The measurement is running: the numbers and regions arrive on the next call.' : null,
      c.calculationState === 'too_large' ? `Too large to measure (${c.raw?.error ?? c.effective?.error ?? 'over the pixel budget'}): ask get_visual_diff_image for crops and compare by eye.` : null,
      c.calculationState === 'failed' ? `The measurement failed: ${c.raw?.error ?? c.effective?.error ?? 'an image could not be read'}.` : null,
      c.comparisonStatus === 'incompatible' ? `The captures were taken differently (${c.compatibility.differences.join('; ')}): pixel numbers compare two different screens, not one screen twice.` : null,
      c.suspended.length ? `${c.suspended.length} rule${c.suspended.length === 1 ? ' was' : 's were'} drawn on an image of another size and not applied here.` : null,
      n.regionsComplete === false ? 'The measurement kept only its largest regions; smaller changes exist that are not listed.' : null,
      policy === 'effective' && c.applied.length === 0 ? 'No rule applies: effective and raw are the same measurement.' : null,
    ].filter(Boolean);
    const headRun = runs.get(pair.head!.runId);
    const data: z.infer<typeof getOutput> = {
      project: project.ref,
      comparisonId: c.comparisonId!,
      revision: c.revision!,
      base: side(pair.base!),
      head: side(pair.head!),
      test: { testId: t.test.testId, title: t.test.titlePath.join(' › ') || t.test.title, titlePath: t.test.titlePath, file: t.test.file, line: t.test.line, browser: t.test.browser },
      checkpoint: { name: t.checkpoint.name, title: checkpointLabel(t.checkpoint.name, t.checkpoint.title), order: t.checkpoint.sequence + 1, stepPath: t.checkpoint.stepPath, url: t.checkpoint.url, pageTitle: t.checkpoint.pageTitle },
      variant: pair.head!.variant,
      capture: {
        viewport: pair.head!.viewportWidth ? `${pair.head!.viewportWidth}×${pair.head!.viewportHeight}` : null,
        deviceScaleFactor: pair.head!.deviceScaleFactor,
        fullPage: pair.head!.fullPage,
        isMobile: pair.head!.isMobile,
      },
      compatibility: c.compatibility,
      comparisonStatus: c.comparisonStatus,
      calculationState: c.calculationState,
      byteIdentical: c.byteIdentical,
      rawChangedPixels: n.rawChangedPixels,
      ignoredChangedPixels: n.ignoredChangedPixels,
      effectiveChangedPixels: n.effectiveChangedPixels,
      totalPixels: n.totalPixels,
      rawChangedPercent: n.rawChangedPercent,
      effectiveChangedPercent: n.effectiveChangedPercent,
      ignoredAreaPixels: n.ignoredAreaPixels,
      sizeChanged: n.sizeChanged,
      contentMoved: n.contentMoved,
      threshold: c.settings.threshold,
      ignoreRuleRevision: c.rules.revision,
      rules: {
        applied: c.applied.map((r) => ({ id: r.id, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, reason: r.reason, source: r.source })),
        suspended: c.suspended.map((s) => ({ id: s.rule.id, rect: { x: s.rule.x, y: s.rule.y, width: s.rule.width, height: s.rule.height }, why: s.validity })),
      },
      regions: regions.slice(page.offset, page.offset + page.limit),
      regionsComplete: n.regionsComplete,
      nextRegionCursor: nextCursor('get_visual_diff', { comparison: c.comparisonId, policy, revision: c.revision }, page, regions.length),
      retryAfterMs: retryAfter(c),
      reviewUrl: headRun ? reviewUrl(project.links, headRun.number, pair.head!) : null,
      interpretation: null,
      note: notes.join(' ') || null,
    };
    return {
      data,
      render(md, d) {
        md.heading(`${d.checkpoint.title} — ${d.variant}: run #${d.head.run?.run ?? '?'} against run #${d.base.run?.run ?? '?'}`, 2);
        md.kv([
          ['Test', `${d.test.title} (${d.test.file}${d.test.line ? `:${d.test.line}` : ''}, ${d.test.browser})`],
          ['Checkpoint key', `\`${d.checkpoint.name}\`${d.checkpoint.stepPath.length ? ` · step ${d.checkpoint.stepPath.join(' › ')}` : ''}`],
          ['Page', d.checkpoint.url],
          ['Captured', [d.capture.viewport, d.capture.deviceScaleFactor ? `@${d.capture.deviceScaleFactor}×` : null, d.capture.fullPage ? 'full page' : null].filter(Boolean).join(' ') || null],
          ['Status', `${d.comparisonStatus} (measurement ${d.calculationState}${d.compatibility.status === 'incompatible' ? '; incompatible captures' : ''})`],
          ['Pixels', d.rawChangedPixels !== null ? `${d.rawChangedPixels.toLocaleString('en')} raw · ${(d.ignoredChangedPixels ?? 0).toLocaleString('en')} left out by rules · ${(d.effectiveChangedPixels ?? d.rawChangedPixels).toLocaleString('en')} remaining, of ${d.totalPixels?.toLocaleString('en')} (${d.rawChangedPercent}% raw)` : null],
          ['Size', d.sizeChanged ? `changed: base ${d.base.width}×${d.base.height}, head ${d.head.width}×${d.head.height}` : d.sizeChanged === false ? 'same' : null],
          ['Content moved', d.contentMoved ? 'yes: rows were inserted or removed, the rest only shifted' : null],
          ['Rules', d.rules.applied.length || d.rules.suspended.length ? `${d.rules.applied.length} applied, ${d.rules.suspended.length} suspended (revision ${d.ignoreRuleRevision})` : null],
          ['Revision', d.revision],
          ['In the app', d.reviewUrl],
          ['Base image', d.base.imageUrl],
          ['Head image', d.head.imageUrl],
        ]);
        if (d.regions.length) {
          md.heading(`Regions (${policy}), reading order`, 3);
          md.table(
            ['Label', 'Id', 'Kind', 'Head rect (x, y, w, h)', 'Base rect', 'Raw px', 'Rules'],
            d.regions.map((r) => [r.label, r.id, r.kind, r.headRect ? `${r.headRect.x}, ${r.headRect.y}, ${r.headRect.width}, ${r.headRect.height}` : '—', r.baseRect ? `${r.baseRect.x}, ${r.baseRect.y}, ${r.baseRect.width}, ${r.baseRect.height}` : '—', r.rawChangedPixels, r.ignore === 'none' ? '—' : `${r.ignore}: ${r.ignoredBy.join(', ')}`]),
          );
          if (d.nextRegionCursor) md.line('More regions with regionCursor.');
          md.line(`Next: get_visual_diff_image with comparison "${d.comparisonId}", mode "annotated" and scope "overview" to see where the regions are, then mode "pair" with regionIds to read what changed.`);
        } else if (d.calculationState === 'done') md.line('No changed regions.');
        if (d.note) md.line(d.note);
      },
    };
  },
});

// ---------------------------------------------------------------- get_visual_diff_image

const imageInput = z.object({
  ...commonParams,
  comparison: z.string().describe('The comparisonId.'),
  revision: z.string().optional().describe('From get_visual_diff: the call fails with REVISION_CONFLICT if the rules or settings changed since.'),
  mode: z.enum(VISUAL_DIFF_MODES).optional().describe('annotated (default): head with regions boxed D1, D2…; pair: base and head of each region, readable; highlight: changed pixels painted; mask: white where changed; difference: colour difference; onion: head faded over base; base / head: as they are.'),
  scope: z.enum(VISUAL_DIFF_SCOPES).optional().describe('overview (whole image, scaled down), regions (each region at full resolution with context; default for pair), crop (one rectangle).'),
  regionIds: z.array(z.string()).max(50).optional().describe('With scope regions: which regions (ids or labels like "D2"). Default: the first ones in order.'),
  order: z.enum(['reading', 'largest']).optional().describe('Which regions come first without regionIds: reading order (default) or the most changed pixels.'),
  crop: z.object({ x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().min(1), height: z.number().int().min(1), space: z.enum(['base', 'head']).optional().describe('Whose pixels the rectangle is in (default head).') }).optional(),
  policy: z.enum(MASK_POLICIES).optional().describe('raw (default) or effective: whose changed pixels highlight/mask paint and whose regions are boxed.'),
  showIgnored: z.boolean().optional().describe('Hatch the areas left out on annotated images. Default true.'),
  contextPadding: z.number().int().min(0).max(400).optional().describe(`Context around a region, in CSS pixels (default ${DEFAULT_CONTEXT_PADDING}).`),
  maxImages: z.number().int().min(1).max(MAX_IMAGES).optional().describe(`At most this many images (default ${DEFAULT_MAX_IMAGES}). Regions that do not fit are named in nextRegionIds.`),
  maxBytes: z.number().int().min(16 * 1024).optional().describe('Per image; the server has its own ceiling.'),
  delivery: z.enum(['inline', 'links']).optional().describe('inline (default): the images attached. links: short-lived signed links instead (what the REST API returns).'),
});

const imageOut = z.object({
  index: z.number().describe('Position among the attached images, from 1.'),
  role: z.enum(['overview', 'region', 'crop']),
  mode: z.string(),
  side: z.enum(['base', 'head', 'both']).describe('Which image is shown; both for highlight, mask, difference and onion.'),
  baseCaptureId: z.string().nullable(),
  headCaptureId: z.string().nullable(),
  regionIds: z.array(z.string()),
  label: z.string(),
  sourceRect: rectOut.describe('What the image shows, in image pixels of `space`.'),
  space: z.enum(['base', 'head']),
  coordinateSpace: z.literal('image-pixels'),
  captureScale: z.number().nullable().describe('Device scale factor of the capture, when known: image pixels ÷ this = CSS pixels.'),
  outputWidth: z.number(),
  outputHeight: z.number(),
  scale: z.number().describe('Output pixels per source pixel (≤ 1).'),
  tile: z.object({ n: z.number(), of: z.number() }).nullable(),
  maskSource: z.enum(['measurement', 'computed']).nullable().describe('Where the changed pixels came from: the stored measurement, or pixelmatch run on this rectangle now.'),
  bytes: z.number().nullable(),
  mimeType: z.string().nullable(),
  url: z.string().nullable().describe('With delivery links: a short-lived signed link to this image.'),
  expiresAt: z.string().nullable(),
});

const imageOutput = output({
  project: z.string(),
  comparisonId: z.string(),
  revision: z.string(),
  mode: z.string(),
  scope: z.string(),
  policy: z.string(),
  images: z.array(imageOut),
  omitted: z.array(z.string()),
  nextRegionIds: z.array(z.string()).describe('Regions that did not fit maxImages: ask again with them as regionIds.'),
  warnings: z.array(z.string()),
  retryAfterMs: z.number().nullable(),
});

type Img = { image: ImageContent | null; meta: z.infer<typeof imageOut> };

async function overlayFor(c: Comparison, policy: 'raw' | 'effective'): Promise<Buffer | null> {
  const row = policy === 'raw' ? c.raw : (c.effective ?? c.raw);
  if (!row || row.status !== 'done' || !row.overlayKey) return null;
  const object = await getStorage().get(row.overlayKey);
  if (!object) return null;
  return Buffer.from(await new Response(object.stream).arrayBuffer());
}

export const getVisualDiffImage = defineTool({
  name: 'get_visual_diff_image',
  title: 'Get images of a visual difference',
  toolset: 'debug',
  description:
    'The pictures of one visual comparison, in the mode that reads best: the head with the regions boxed and numbered (annotated), base and head of one region side by side at full resolution so a changed name or price can be read (pair, with regionIds), the changed pixels painted red (highlight), the threshold mask, the colour difference, the two faded over each other (onion), or a plain crop. Long regions come tiled, never shrunk; one image per call is described in images[] with the rectangle it shows. Start with annotated + overview, then pair for the regions you care about.',
  input: imageInput,
  output: imageOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { artifact: ['read'] });
    const pair = await resolveComparison(project.project.id, { comparison: args.comparison });
    const [c] = await compare([pair], { plan: true });
    if (args.revision && args.revision !== c.revision) throw new ToolError('REVISION_CONFLICT', `The comparison's rules or settings changed: revision ${c.revision} now, ${args.revision} asked for.`, 'Call get_visual_diff again and read the current regions before asking for images.');
    const mode = args.mode ?? 'annotated';
    const scope = args.scope ?? (mode === 'pair' ? 'regions' : args.crop ? 'crop' : args.regionIds?.length ? 'regions' : 'overview');
    if (scope === 'crop' && !args.crop) throw invalid('scope "crop" needs "crop".');
    if (scope !== 'crop' && args.crop) throw invalid('"crop" goes with scope "crop".');
    if (scope !== 'regions' && args.regionIds?.length) throw invalid('"regionIds" go with scope "regions".');
    const policy = args.policy ?? 'raw';
    const regions = regionsOf(c, policy);
    const n = numbersOf(c);
    const [baseSource, headSource] = await Promise.all([loadSource(pair.base!), loadSource(pair.head!)]);
    const sizes = { base: baseSource ? { width: baseSource.width, height: baseSource.height } : null, head: headSource ? { width: headSource.width, height: headSource.height } : null };
    const plan = planImages(
      {
        mode,
        scope,
        regionIds: args.regionIds ?? [],
        order: args.order ?? 'reading',
        crop: args.crop ? { x: args.crop.x, y: args.crop.y, width: args.crop.width, height: args.crop.height, space: args.crop.space ?? 'head' } : null,
        contextPadding: args.contextPadding ?? DEFAULT_CONTEXT_PADDING,
        maxImages: args.maxImages ?? DEFAULT_MAX_IMAGES,
        captureScale: pair.head!.deviceScaleFactor,
        sizes,
      },
      regions,
    );
    const warnings = [...plan.warnings];
    if (!baseSource || !headSource) warnings.push(`${!baseSource ? 'The base image' : 'The head image'} is not stored (expired, still uploading, or not an image): only the other side can be shown.`);
    if (c.calculationState === 'pending') warnings.push('The measurement is still running: regions are not known yet; annotated shows the image without boxes.');
    if (c.calculationState === 'too_large') warnings.push('Too large to measure: regions are not known. Use crop, or base/head overviews, and compare by eye.');
    const maxBytes = Math.min(args.maxBytes ?? inlineImageMaxBytes(), inlineImageMaxBytes() * 4);
    const renderCtx: RenderContext = { base: baseSource, head: headSource, overlay: await overlayFor(c, policy), threshold: c.settings.threshold, policy, ignore: c.applied };
    const links = args.delivery === 'links';
    const ttl = artifactUrlTtlSeconds();
    const images: Img[] = [];
    const omitted = [...plan.omitted];
    const metaOf = (p: PlannedImage, r: Rendered | null, url: { path: string; expiresAt: Date } | null): z.infer<typeof imageOut> => ({
      index: images.length + 1,
      role: p.role,
      mode: p.mode,
      side: r?.side ?? (['highlight', 'mask', 'difference', 'onion'].includes(p.mode) ? 'both' : p.side),
      baseCaptureId: p.side === 'base' || r?.side === 'both' ? pair.base!.id : null,
      headCaptureId: p.side === 'head' || r?.side === 'both' ? pair.head!.id : null,
      regionIds: p.regionIds,
      label: p.label,
      sourceRect: r?.sourceRect ?? p.rect ?? { x: 0, y: 0, width: sizes[p.side]?.width ?? 0, height: sizes[p.side]?.height ?? 0 },
      space: r?.side === 'both' ? 'head' : p.side,
      coordinateSpace: 'image-pixels',
      captureScale: (p.side === 'base' ? pair.base! : pair.head!).deviceScaleFactor,
      outputWidth: r?.width ?? 0,
      outputHeight: r?.height ?? 0,
      scale: r?.scale ?? 0,
      tile: p.tile,
      maskSource: r?.maskSource ?? null,
      bytes: r?.data.byteLength ?? null,
      mimeType: r?.mimeType ?? null,
      url: url ? `${baseUrl()}${url.path}` : null,
      expiresAt: url?.expiresAt.toISOString() ?? null,
    });
    for (const p of plan.images) {
      if (links) {
        const signed = signVisualRenderPath(c.comparisonId!, specQuery(p, { policy, showIgnored: args.showIgnored !== false, revision: c.revision }), ttl);
        images.push({ image: null, meta: metaOf(p, null, signed) });
        continue;
      }
      try {
        const r = await render({ mode: p.mode, side: p.side, rect: p.rect, regions: p.mode === 'annotated' ? regions.filter((reg) => p.regionIds.includes(reg.id)) : undefined, ignored: args.showIgnored === false ? [] : c.applied, maxBytes }, renderCtx);
        images.push({ image: { type: 'image', data: r.data.toString('base64'), mimeType: r.mimeType }, meta: metaOf(p, r, null) });
      } catch (error) {
        if (error instanceof RenderError) omitted.push(`${p.label}: ${error.message}`);
        else throw error;
      }
    }
    const data: z.infer<typeof imageOutput> = {
      project: project.ref,
      comparisonId: c.comparisonId!,
      revision: c.revision!,
      mode,
      scope,
      policy,
      images: images.map((i) => i.meta),
      omitted,
      nextRegionIds: plan.nextRegionIds,
      warnings,
      retryAfterMs: retryAfter(c),
    };
    return {
      data,
      images: images.flatMap((i) => (i.image ? [i.image] : [])),
      render(md, d) {
        md.heading(`Images of comparison ${d.comparisonId}: ${describeMode(mode)}, ${d.scope}`, 2);
        if (d.images.length) {
          md.line(`${links ? 'Links' : 'Attached'}, in order: ${d.images.map((i) => `${i.index}. ${i.label} — ${i.sourceRect.width}×${i.sourceRect.height} px at ${i.sourceRect.x},${i.sourceRect.y} of the ${i.space} image, shown at ${i.outputWidth}×${i.outputHeight}${i.maskSource === 'computed' ? ' (changed pixels measured now, not from the stored measurement)' : ''}${i.url ? `: ${link('image', i.url)}` : ''}`).join('; ')}.`);
          md.line(`Coordinates are the ${d.images.some((i) => i.space === 'base') ? 'images’' : 'head image’s'} own pixels${pair.head!.deviceScaleFactor && pair.head!.deviceScaleFactor !== 1 ? ` (÷${pair.head!.deviceScaleFactor} for CSS pixels)` : ''}, origin top-left. Boxes and badges are drawn over the originals; the pixels under them are unchanged.`);
        } else md.line('No image could be attached.');
        if (d.nextRegionIds.length) md.line(`Not shown for the image budget: ${d.nextRegionIds.join(', ')}. Ask again with regionIds.`);
        if (d.omitted.length) md.line(`Left out: ${d.omitted.join('; ')}.`);
        for (const w of d.warnings) md.line(w);
        if (n.rawChangedPixels !== null && d.images.length) md.line('What you see is evidence: a text that differs between two runs may be a random fixture, a clock, another user, a sort order or a real change. Check the producing test and its data before concluding.');
      },
    };
  },
});

export const VISUAL_DIFF_TOOLS = [listVisualDiffs, getVisualDiff, getVisualDiffImage];
