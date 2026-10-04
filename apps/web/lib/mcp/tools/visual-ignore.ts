/**
 * The rules that leave areas of a screen out of its comparisons — a clock,
 * a generated name — for assistants: list them with where they came from
 * and what they did, simulate a set on a comparison before anyone saves it,
 * and (with a write-scoped token, and only when the user asked) replace the
 * set under a revision check. A rule is a property of a checkpoint and
 * variant, drawn on one image; on an image of another size it is suspended.
 */
import { z } from 'zod';
import { checkpointLabel } from '@miguelfranken/ui/lib/review';
import { IGNORE_CATEGORIES, IGNORE_FILTERS, RULE_VALIDITIES, ignoreStates, ruleValidity, type IgnoreRule } from '@miguelfranken/ui/lib/visual-diff';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tests } from '@/lib/db/schema';
import { compare, contextFor, resolvePair } from '@/lib/review/diff/comparison';
import { IgnoreRegionsError, IgnoreRevisionConflict, listRuleSets, MAX_IGNORE_REGIONS, previewRules, ruleHistory, rulesOfCapture, setRules } from '@/lib/review/diff/ignore';
import { decidePolicy, policyTargetsFor } from '@/lib/review/diff/policy';
import { requestCaptureDiff } from '@/lib/review/diff/dispatch';
import { readCaptureBytes } from '@/lib/review/images';
import { captureInProject } from '@/lib/review/queries';
import { decodeComparisonId } from '@miguelfranken/ui/lib/visual-diff';
import { invalid, notFound, ToolError } from '../errors';
import { commonParams, cursorParam, isUuid, nextCursor, readPage } from '../params';
import { defineTool, output } from '../registry';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;

const rectIn = z.object({ x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().min(1), height: z.number().int().min(1) });

const ruleOut = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  reason: z.string().nullable(),
  category: z.string().nullable(),
  source: z.enum(['manual', 'ai_suggestion', 'legacy']),
  active: z.boolean(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  drawnOn: z.object({ captureId: z.string().nullable(), imageWidth: z.number(), imageHeight: z.number() }).nullable().describe('The image the rule was drawn on; null for a legacy rule, applied unchecked.'),
  validity: z.enum(RULE_VALIDITIES).nullable().describe('On the capture asked about: valid, legacy, geometry_changed (suspended), out_of_bounds (suspended) or inactive.'),
});

const ruleOutOf = (r: IgnoreRule, image: { width: number | null; height: number | null } | null): z.infer<typeof ruleOut> => ({
  id: r.id,
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
  reason: r.reason,
  category: r.category,
  source: r.source,
  active: r.active,
  createdAt: r.createdAt,
  createdBy: r.createdBy,
  drawnOn: r.geometry ? { captureId: r.geometry.originCaptureId, imageWidth: r.geometry.imageWidth, imageHeight: r.geometry.imageHeight } : null,
  validity: image ? ruleValidity(r, image) : null,
});

// ---------------------------------------------------------------- list_visual_ignore_rules

const listInput = z.object({
  ...commonParams,
  capture: z.string().optional().describe('One capture: the rules of its checkpoint and variant, each checked against this image, with the history of the set.'),
  test: z.string().optional().describe('Part of a test title or file.'),
  status: z.enum(['active', 'all']).optional().describe('active (default): sets with a rule switched on; all: every set ever saved.'),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: cursorParam,
});

const setOut = z.object({
  test: z.object({ testId: z.string(), title: z.string(), file: z.string() }),
  checkpoint: z.object({ name: z.string(), title: z.string() }),
  variant: z.string(),
  revision: z.number(),
  updatedAt: z.string(),
  rules: z.array(ruleOut),
  states: z.array(z.enum(IGNORE_FILTERS)).optional(),
  history: z.array(z.object({ revision: z.number(), at: z.string(), by: z.string().nullable(), source: z.string(), reason: z.string().nullable(), rules: z.number() })).optional(),
});

const listOutput = output({
  project: z.string(),
  counts: z.object({ sets: z.number(), rules: z.number(), active: z.number(), returned: z.number() }),
  sets: z.array(setOut),
  nextCursor: z.string().nullable(),
});

export const listVisualIgnoreRules = defineTool({
  name: 'list_visual_ignore_rules',
  title: 'List the areas left out of comparisons',
  toolset: 'core',
  description:
    'The rules that leave areas of review screens out of their pixel comparisons (a clock, a generated name), per checkpoint and variant: each rule’s rectangle, reason, who drew it on which image, whether it is switched on, and — for one capture — whether it still fits that image or is suspended, plus the revision history of the set. Pass the revision to set_visual_ignore_rules.',
  input: listInput,
  output: listOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    if (args.capture) {
      if (!isUuid(args.capture)) throw invalid('"capture" is a capture id.');
      const found = await captureInProject(project.project.id, args.capture.toLowerCase());
      if (!found) throw notFound(`Capture ${args.capture} not found in ${project.ref}.`);
      const c = found.capture;
      const history = await ruleHistory(project.project.id, c);
      const set: z.infer<typeof setOut> = {
        test: { testId: c.testId, title: found.testTitle, file: '' },
        checkpoint: { name: c.checkpointName, title: checkpointLabel(c.checkpointName, found.checkpointTitle) },
        variant: c.variant,
        revision: c.ignore.revision,
        updatedAt: history[0]?.createdAt.toISOString() ?? c.createdAt.toISOString(),
        rules: c.ignore.rules.map((r) => ruleOutOf(r, { width: c.width, height: c.height })),
        states: [...ignoreStates(c.ignore)],
        history: history.map((h) => ({ revision: h.revision, at: h.createdAt.toISOString(), by: h.changedBy, source: h.source, reason: h.reason, rules: h.rules.length })),
      };
      const [context] = [...(await contextFor([c])).values()];
      if (context) set.test = { testId: context.test.testId, title: context.test.titlePath.join(' › ') || context.test.title, file: context.test.file };
      return {
        data: { project: project.ref, counts: { sets: 1, rules: set.rules.length, active: set.rules.filter((r) => r.active).length, returned: 1 }, sets: [set], nextCursor: null },
        render(md, d) {
          const s = d.sets[0];
          md.heading(`Areas left out: ${s.checkpoint.title} — ${s.variant} (revision ${s.revision})`, 2);
          renderRules(md, s);
          if (s.history?.length) md.table(['Revision', 'When', 'By', 'Source', 'Rules', 'Reason'], s.history.map((h) => [h.revision, h.at, h.by, h.source, h.rules, h.reason]));
          if (s.states?.length) md.line(`On this image: ${s.states.join(', ')}.`);
        },
      };
    }
    const all = await listRuleSets(project.project.id);
    const wanted = (args.status ?? 'active') === 'all' ? all : all.filter((s) => s.rules.some((r) => r.active));
    const q = args.test?.toLowerCase();
    const testIds = [...new Set(wanted.map((s) => s.identity.testId))];
    const titles = testIds.length ? await db.select({ id: tests.id, title: tests.title, titlePath: tests.titlePath, file: tests.file }).from(tests).where(inArray(tests.id, testIds)) : [];
    const titleOf = new Map(titles.map((t) => [t.id, t]));
    const filtered = wanted.filter((s) => {
      const t = titleOf.get(s.identity.testId);
      return !q || (t && (t.title.toLowerCase().includes(q) || t.titlePath.join(' ').toLowerCase().includes(q) || t.file.toLowerCase().includes(q)));
    });
    const page = readPage('list_visual_ignore_rules', { status: args.status, test: args.test }, { limit: args.limit ?? 50, cursor: args.cursor });
    const sets = filtered.slice(page.offset, page.offset + page.limit).map((s): z.infer<typeof setOut> => {
      const t = titleOf.get(s.identity.testId);
      return {
        test: { testId: s.identity.testId, title: t ? t.titlePath.join(' › ') || t.title : '', file: t?.file ?? '' },
        checkpoint: { name: s.identity.checkpointName, title: checkpointLabel(s.identity.checkpointName) },
        variant: s.identity.variant,
        revision: s.revision,
        updatedAt: s.updatedAt.toISOString(),
        rules: s.rules.map((r) => ruleOutOf(r, null)),
      };
    });
    return {
      data: {
        project: project.ref,
        counts: { sets: filtered.length, rules: filtered.reduce((n, s) => n + s.rules.length, 0), active: filtered.reduce((n, s) => n + s.rules.filter((r) => r.active).length, 0), returned: sets.length },
        sets,
        nextCursor: nextCursor('list_visual_ignore_rules', { status: args.status, test: args.test }, page, filtered.length),
      },
      render(md, d) {
        md.heading(`Areas left out of comparisons in ${d.project}`, 2);
        md.line(`${d.counts.sets} screen${d.counts.sets === 1 ? '' : 's'} with rules, ${d.counts.active} rule${d.counts.active === 1 ? '' : 's'} switched on. Showing ${d.counts.returned}${d.nextCursor ? ' — more with nextCursor' : ''}.`);
        if (!d.sets.length) md.line('No rules. Every comparison counts every pixel.');
        md.table(['Test', 'Checkpoint', 'Variant', 'Revision', 'Rules', 'Rectangles (x, y, w, h)'], d.sets.map((s) => [s.test.title, s.checkpoint.title, s.variant, s.revision, `${s.rules.filter((r) => r.active).length} on / ${s.rules.length}`, s.rules.map((r) => `${r.id.slice(0, 8)}: ${r.x}, ${r.y}, ${r.width}, ${r.height}${r.reason ? ` — ${r.reason}` : ''}`).join('; ')]));
        md.line('Pass a capture id for the rules checked against one image and the history of the set.');
      },
    };
  },
});

function renderRules(md: { table(h: string[], rows: (string | number | null | undefined)[][]): number; line(s: string): void }, s: z.infer<typeof setOut>) {
  if (!s.rules.length) return void md.line('No rules.');
  md.table(['Id', 'Rectangle (x, y, w, h)', 'On', 'Source', 'Validity here', 'Reason', 'Drawn on'], s.rules.map((r) => [r.id, `${r.x}, ${r.y}, ${r.width}, ${r.height}`, r.active ? 'yes' : 'no', r.source, r.validity ?? '—', r.reason, r.drawnOn ? `${r.drawnOn.imageWidth}×${r.drawnOn.imageHeight}${r.drawnOn.captureId ? ` (${r.drawnOn.captureId})` : ''}` : 'legacy']));
}

// ---------------------------------------------------------------- preview_visual_ignore_rules

const previewInput = z.object({
  ...commonParams,
  comparison: z.string().describe('The comparisonId whose two images the rectangles are tried on.'),
  rules: z.array(rectIn).max(MAX_IGNORE_REGIONS).describe('The rectangles that would be left out, in the head image’s pixels. Tight: a name, not the row it is in.'),
});

const previewOutput = output({
  project: z.string(),
  comparisonId: z.string(),
  revision: z.string(),
  rawChangedPixels: z.number(),
  suppressedPixels: z.number().describe('Changed pixels the rectangles would leave out.'),
  remainingPixels: z.number().describe('Changed pixels that would still count.'),
  totalPixels: z.number(),
  ignoredAreaPixels: z.number().describe('The rectangles’ area, each pixel once.'),
  ignoredAreaPercent: z.number(),
  sizeChanged: z.boolean().describe('A size change is never left out by a rule.'),
  regions: z.array(z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), pixels: z.number(), covered: z.enum(['none', 'partial', 'full']) })),
  remainingRegions: z.number(),
  warnings: z.array(z.string()),
});

export const previewVisualIgnoreRules = defineTool({
  name: 'preview_visual_ignore_rules',
  title: 'Preview rules that leave areas out',
  toolset: 'core',
  description:
    'What a set of rectangles would do to one comparison, measured now and saved nowhere: the raw changed pixels, how many the rectangles would leave out, how many would remain, and which measured regions they cover wholly or in part. Use it before proposing a rule; a rectangle that covers more than the dynamic text (a price beside a name) is too wide. A size change is never left out.',
  input: previewInput,
  output: previewOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { artifact: ['read'] });
    const decoded = decodeComparisonId(args.comparison.trim());
    if (!decoded) throw new ToolError('INVALID_COMPARISON', `"${args.comparison}" is not a comparison id.`, 'Use the comparisonId from list_visual_diffs.');
    const pair = await resolvePair(project.project.id, decoded.baseCaptureId, decoded.headCaptureId);
    if (!pair) throw notFound('That comparison is not in this project.');
    const [c] = await compare([pair]);
    const [base, head] = await Promise.all([readCaptureBytes(pair.base!), readCaptureBytes(pair.head!)]);
    if (!base || !head) throw new ToolError('SOURCE_UNAVAILABLE', 'An image of the comparison is not stored (expired or still uploading).');
    let result;
    try {
      result = await previewRules(Buffer.from(base.bytes), Buffer.from(head.bytes), args.rules, c.settings.threshold);
    } catch (error) {
      if (error instanceof IgnoreRegionsError) throw new ToolError('DIFF_TOO_LARGE', error.message);
      throw error;
    }
    const warnings: string[] = [];
    const areaPct = result.totalPixels ? (result.ignoredAreaPixels / result.totalPixels) * 100 : 0;
    if (areaPct > 10) warnings.push(`The rectangles cover ${areaPct.toFixed(1)}% of the image: a comparison that ignores this much is no longer exact.`);
    if (result.sizeChanged) warnings.push('The images differ in size; no rule leaves that out.');
    const partial = result.regions.filter((r) => r.covered === 'partial').length;
    if (partial) warnings.push(`${partial} region${partial === 1 ? ' is' : 's are'} covered only in part: either widen to the change itself or leave it alone.`);
    const data: z.infer<typeof previewOutput> = {
      project: project.ref,
      comparisonId: c.comparisonId!,
      revision: c.revision!,
      rawChangedPixels: result.rawChangedPixels,
      suppressedPixels: result.suppressedPixels,
      remainingPixels: result.effectiveChangedPixels,
      totalPixels: result.totalPixels,
      ignoredAreaPixels: result.ignoredAreaPixels,
      ignoredAreaPercent: Math.round(areaPct * 1000) / 1000,
      sizeChanged: result.sizeChanged,
      regions: result.regions,
      remainingRegions: result.remainingRegions,
      warnings,
    };
    return {
      data,
      render(md, d) {
        md.heading(`Preview: ${args.rules.length} rectangle${args.rules.length === 1 ? '' : 's'} on comparison ${d.comparisonId}`, 2);
        md.line(`${d.rawChangedPixels.toLocaleString('en')} changed pixels raw · ${d.suppressedPixels.toLocaleString('en')} would be left out · ${d.remainingPixels.toLocaleString('en')} would remain (${d.remainingRegions} region${d.remainingRegions === 1 ? '' : 's'}). The rectangles cover ${d.ignoredAreaPercent}% of the image.`);
        if (d.regions.length) md.table(['Region (x, y, w, h)', 'Changed px', 'Covered'], d.regions.map((r) => [`${r.x}, ${r.y}, ${r.width}, ${r.height}`, r.pixels, r.covered]));
        for (const w of d.warnings) md.line(w);
        md.line('Nothing was saved. A rule is a person’s call: propose it with its reason, or save it with set_visual_ignore_rules only when the user asked for that.');
      },
    };
  },
});

// ---------------------------------------------------------------- set_visual_ignore_rules

const setInput = z.object({
  ...commonParams,
  capture: z.string().describe('The capture the rules are drawn on: its checkpoint and variant get the set, its image size is recorded on new rules.'),
  rules: z
    .array(
      rectIn.extend({
        id: z.string().optional().describe('Keep an existing rule (its id from list_visual_ignore_rules); without it the rectangle is a new rule.'),
        reason: z.string().max(500).optional().describe('Why the area is left out, for the people who review this screen.'),
        category: z.enum(IGNORE_CATEGORIES).optional(),
        active: z.boolean().optional().describe('false keeps the rule but switches it off.'),
      }),
    )
    .max(MAX_IGNORE_REGIONS)
    .describe('The whole set after the change: rules not listed are removed (kept in the history). An empty list removes every rule.'),
  expectedRevision: z.number().int().min(0).describe('The revision you read (list_visual_ignore_rules or get_visual_diff). Refused when it moved.'),
  reason: z.string().max(500).optional().describe('Why the set changed, for the history.'),
});

const setOutput = output({
  project: z.string(),
  captureId: z.string(),
  revision: z.number(),
  rules: z.array(ruleOut),
  remeasured: z.boolean().describe('The capture’s comparison was queued to be measured again under the new rules.'),
});

export const setVisualIgnoreRules = defineTool({
  name: 'set_visual_ignore_rules',
  title: 'Set the areas left out of a screen’s comparisons',
  toolset: 'write',
  description:
    'Replaces the rules that leave areas of a checkpoint’s variant out of its comparisons, under a revision check, with a reason: tight rectangles in the image’s pixels, each with why. Later runs are measured without those areas; a tolerance approval that rested on the old rules is reviewed again. Only when the user asked for it — preview first with preview_visual_ignore_rules, and never to make a real change disappear.',
  input: setInput,
  output: setOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { review: ['decide'] });
    if (!isUuid(args.capture)) throw invalid('"capture" is a capture id.');
    const found = await rulesOfCapture(project.project.id, args.capture.toLowerCase());
    if (!found) throw notFound(`Capture ${args.capture} not found in ${project.ref}.`);
    const target = (await policyTargetsFor([found.capture])).get(found.capture.id)!;
    const policy = decidePolicy(project.project.settings, 'ignore', target);
    if (!policy.allowed) throw new ToolError('POLICY_DENIED', `Leaving areas out is not allowed for this screen: ${policy.reason}`, 'A project admin can change the policy under Settings → Visual comparison.');
    let set;
    try {
      set = await setRules({
        projectId: project.project.id,
        capture: found.capture,
        rules: args.rules.map((r) => ({ ...r, id: r.id ?? null, reason: r.reason ?? null, category: r.category ?? null, active: r.active ?? true })),
        expectedRevision: args.expectedRevision,
        reason: args.reason,
        source: 'mcp',
        userId: project.user.id,
      });
    } catch (error) {
      if (error instanceof IgnoreRevisionConflict) throw new ToolError('REVISION_CONFLICT', error.message, 'Call list_visual_ignore_rules with the capture and pass its revision.');
      if (error instanceof IgnoreRegionsError) throw invalid(error.message);
      throw error;
    }
    const compared = await captureInProject(project.project.id, found.capture.id);
    const remeasured = compared ? await requestCaptureDiff(compared.capture) : false;
    const image = { width: found.capture.width, height: found.capture.height };
    return {
      data: { project: project.ref, captureId: found.capture.id, revision: set.revision, rules: set.rules.map((r) => ruleOutOf(r, image)), remeasured },
      render(md, d) {
        md.line(`Rules saved as revision ${d.revision}: ${d.rules.filter((r) => r.active).length} switched on${d.remeasured ? '; the comparison is being measured again' : ''}.`);
        renderRules(md, { test: { testId: '', title: '', file: '' }, checkpoint: { name: '', title: '' }, variant: '', revision: d.revision, updatedAt: '', rules: d.rules });
      },
    };
  },
});

export const VISUAL_IGNORE_TOOLS = [listVisualIgnoreRules, previewVisualIgnoreRules, setVisualIgnoreRules];
