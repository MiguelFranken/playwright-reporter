/**
 * Review checkpoints for assistants: what a run's journeys looked like, which
 * images changed against their approved baseline, the images themselves — and,
 * with a write-scoped token, the decision. An agent that changed the UI can
 * look at its own work before a human does, and hand the human only what
 * really changed.
 *
 * Comment threads come with the images: the image arrives with each open
 * thread drawn on it as a numbered pin (and the area it marks), a close-up per
 * pin, and the threads listed by the same numbers — so "#2: the totals lost
 * their border" points at a place, as it does for a person in the viewer.
 */
import type { ImageContent } from '@modelcontextprotocol/server';
import sharp from 'sharp';
import { z } from 'zod';
import { checkpointLabel, describeDiff, emptyReviewCounts, matchesReviewFilter, REVIEW_DECISIONS, REVIEW_FILTERS, statusAgainstRun, type CompareRule, type ReviewDiffView } from '@miguelfranken/ui/lib/review';
import { MAX_COMMENT_LENGTH, projectAnchor } from '@miguelfranken/ui/lib/review-threads';
import { MARKUP_COLORS, MARKUP_TOOLS, type MarkupShape } from '@miguelfranken/ui/lib/review-markup';
import { signCaptureImagePath } from '@/lib/auth/artifact-url';
import { baseUrl } from '@/lib/auth/config';
import { encodeComparisonId, IGNORE_FILTERS, ignoreStates, matchesIgnoreFilter } from '@miguelfranken/ui/lib/visual-diff';
import { annotate, cropAround } from '@/lib/review/annotate';
import { captureDrawings, pinSpecs, readCaptureBytes, threadComments, threadDrawing, threadPosition } from '@/lib/review/images';
import { createThread, ThreadError, type CaptureThread } from '@/lib/review/threads';
import { db } from '@/lib/db/drizzle';
import { runs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { captureInProject, capturesById, decide, MAX_DECISION_CAPTURES, ReviewError, runCapturesByScreen, runReview, type CaptureRecord, type ComparedCapture } from '@/lib/review/queries';
import { toDiffView } from '@/lib/review/view-model';
import { measureEach, type MeasuredReference } from '@/lib/review/diff/compare';
import { identityKey, type DiffRecord } from '@/lib/review/diff/lookup';
import { compareRunRecords } from '@/lib/review/run-flows';
import { artifactUrlTtlSeconds, inlineImageMaxBytes } from '../config';
import { invalid, notFound } from '../errors';
import { agentParam, branchParam, commonParams, isUuid, runParam } from '../params';
import { agentNameFor } from '../agent';
import { defineTool, output } from '../registry';
import { link } from '../render/markdown';
import { resolveRun } from '../resolve';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;

/** Close-ups sent without being asked for: beyond this many open pins, only with `thread`. */
const AUTO_CROPS = 6;

// ---------------------------------------------------------------- threads, shared with review-threads.ts

const box = z.object({ x: z.number(), y: z.number(), w: z.number().nullable(), h: z.number().nullable() });
const bounds = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

/** A shape drawn with a thread. */
export const drawingOut = z
  .array(
    z.object({
      tool: z.enum(MARKUP_TOOLS).describe('pen and highlighter: freehand strokes; arrow: from its start to its head; rect, ellipse: a box or an ellipse.'),
      color: z.enum(MARKUP_COLORS).describe('The colour it was drawn in: comments refer to shapes by it ("the blue area should grow").'),
      pixels: bounds.describe('The box the shape covers, in this image’s pixels.'),
      percent: bounds.describe('The same box in percent of the image.'),
      text: z.string().describe('The shape in words, e.g. "red arrow from (40, 60) to (300, 410) px".'),
    }),
  )
  .nullable()
  .optional()
  .describe('What the reviewer drew with the comment, shape by shape; the anchor is then the area the drawing covers. The image attached with the thread shows it in the same colours.');

/** An AI agent wrote the comment, for a person: `author` is then the agent's name. */
export const agentOut = z
  .object({ name: z.string(), for: z.string().nullable().describe('The person whose access the agent used.') })
  .nullable()
  .optional()
  .describe('Set when an AI agent wrote the comment.');

/** Who a comment is by, in a line of text. */
export const commentBy = (c: { author: string | null; agent?: { name: string; for: string | null } | null; via: string }) =>
  c.agent ? `${c.agent.name} (AI agent${c.agent.for ? ` for ${c.agent.for}` : ''})` : `${c.author ?? 'Someone'}${c.via === 'mcp' ? ' (AI assistant)' : ''}`;

export const threadOut = z.object({
  number: z.number().describe('The number on the pin: how the image, the text and people refer to the thread.'),
  threadId: z.string(),
  status: z.enum(['open', 'resolved']),
  placement: z.enum(['exact', 'outdated']).describe('outdated: placed on an earlier run whose image has changed since, so the pin may be off.'),
  anchor: z.enum(['point', 'area', 'image']).describe('A spot, an area, or the whole image (no pin).'),
  pixels: box.nullable().describe('In this image’s pixels, from its top-left corner.'),
  percent: box.nullable().describe('In percent of the image’s width and height.'),
  css: box.nullable().describe('In the page’s CSS pixels (pixels ÷ device scale factor), when the scale is known.'),
  drawing: drawingOut,
  placedOnRun: z.number().nullable(),
  placedOnCapture: z
    .string()
    .nullable()
    .optional()
    .describe('The capture the thread was placed on. For an outdated thread, get_review_checkpoint with it shows the version the comment was about.'),
  comments: z.array(z.object({ kind: z.string(), author: z.string().nullable(), agent: agentOut, via: z.string(), at: z.string(), body: z.string() })),
  url: z.string().describe('The thread in the app, open at its pin.'),
});

/** Where the viewer opens a capture, and one of its threads: `?cp=…&v=…&thread=3`. */
export function reviewUrl(links: { run: (n: number) => string }, runNumber: number, capture: Pick<CaptureRecord, 'checkpointId' | 'variant'>, thread?: number | null) {
  const q = new URLSearchParams({ cp: capture.checkpointId, v: capture.variant });
  if (thread) q.set('thread', String(thread));
  return `${links.run(runNumber)}/review?${q}`;
}

export function toThreadOut(t: CaptureThread, capture: ComparedCapture, url: string): z.infer<typeof threadOut> {
  const pos = threadPosition(t, capture);
  return {
    number: t.number,
    threadId: t.id,
    status: t.status,
    placement: t.placement,
    anchor: t.anchor.kind,
    pixels: pos.pixels,
    percent: pos.percent,
    css: pos.css,
    drawing: threadDrawing(t, capture),
    placedOnRun: t.originRunNumber,
    placedOnCapture: t.originCaptureId,
    comments: threadComments(t),
    url,
  };
}

/** A thread as a few lines of markdown: number, where, status, then the conversation. */
export function renderThread(md: { line(s: string): void }, t: z.infer<typeof threadOut>, position: string) {
  const flags = [
    t.status,
    t.placement === 'outdated' ? `outdated — placed on run #${t.placedOnRun ?? '?'}, the image changed since${t.placedOnCapture ? ` (that version: capture ${t.placedOnCapture})` : ''}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  md.line(`**#${t.number}** · ${position} · ${flags}`);
  if (t.drawing?.length) md.line(`  - _drawn: ${t.drawing.map((d) => d.text).join('; ')}_`);
  for (const c of t.comments) {
    if (c.kind !== 'comment') md.line(`  - _${c.author ?? 'Someone'} ${c.kind === 'resolved' ? 'resolved it' : 'reopened it'}_`);
    else md.line(`  - ${commentBy(c)}: ${c.body.replace(/\s+/g, ' ')}`);
  }
}

/** An anchor given in percent (what a model reads off any scaling of the image), as fractions. */
export const percentAnchor = z.object({
  x: z.number().min(0).max(100).describe('From the left edge, in percent of the image’s width.'),
  y: z.number().min(0).max(100).describe('From the top edge, in percent of the image’s height.'),
  w: z.number().min(0).max(100).optional().describe('With h: an area this wide, in percent of the width.'),
  h: z.number().min(0).max(100).optional().describe('With w: an area this tall, in percent of the height.'),
});

export function fromPercent(at: z.infer<typeof percentAnchor>) {
  const area = at.w != null && at.h != null && at.w > 0 && at.h > 0;
  return area
    ? { kind: 'area' as const, x: at.x / 100, y: at.y / 100, w: Math.min(at.w!, 100 - at.x) / 100, h: Math.min(at.h!, 100 - at.y) / 100 }
    : { kind: 'point' as const, x: at.x / 100, y: at.y / 100, w: null, h: null };
}

// ---------------------------------------------------------------- list_review_checkpoints

/**
 * What a whole run's images are compared with, as the app's "Compare with":
 * the run before or another run, instead of the approved baseline.
 */
const againstRunParam = z
  .union([z.number().int().positive(), z.string()])
  .optional()
  .describe(
    'Compare every image with "previous" (the same screen in the run before) or another run (128, "#128", a run id or URL) instead of its approved baseline: status, diff and counts then say what changed since that run — unchanged, changed, or new (not captured there) — whatever was approved. Default: the approved baseline, else the run before.',
  );

/** The rule an `against` names: `null` for the default comparison. */
async function againstRule(project: Parameters<typeof resolveRun>[0], against: number | string | undefined, runNumber: number): Promise<CompareRule | null> {
  if (against === undefined || against === 'auto' || against === 'baseline') return null;
  if (against === 'previous') return 'previous';
  const other = await resolveRun(project, against);
  if (other.number === runNumber) throw invalid(`"against" names run #${runNumber} itself: pass "previous" or another run.`);
  return `run:${other.number}`;
}

/** A measured comparison as the tools report it. */
function diffDataOf(diff: DiffRecord, against: ReviewDiffView['against'], withinTolerance = false): z.infer<typeof diffOut> {
  const v = toDiffView(diff, against, withinTolerance);
  return {
    against: v.against,
    state: v.state,
    changedPixels: v.changedPixels,
    changedPercent: Math.round(v.ratio * 100_000) / 1000,
    regions: v.regions.length,
    sizeChanged: v.sizeChanged,
    contentMoved: Boolean(v.shift && (v.shift.inserted.length || v.shift.removed.length)),
    withinTolerance: Boolean(v.withinTolerance),
    summary: describeDiff(v),
  };
}

const PENDING_DIFF: NonNullable<z.infer<typeof diffOut>> = {
  against: 'compare',
  state: 'pending',
  changedPixels: 0,
  changedPercent: 0,
  regions: 0,
  sizeChanged: false,
  contentMoved: false,
  withinTolerance: false,
  summary: 'Measuring the difference…',
};

/** The diff of a capture measured against the run it is compared with. */
const measuredData = (m: MeasuredReference | null): z.infer<typeof diffOut> => (m?.diff ? diffDataOf(m.diff, 'compare') : m?.pending ? PENDING_DIFF : null);

const listInput = z.object({
  ...commonParams,
  run: runParam.optional().describe('The run (default "latest"). Scope "latest" with branch.'),
  branch: branchParam,
  status: z
    .enum(REVIEW_FILTERS)
    .optional()
    .describe('needs-review (default: changed and new images), all, changed, new, unchanged, changes_requested or approved.'),
  test: z.string().optional().describe('Part of a test title or file, to narrow the list.'),
  variant: z.string().optional().describe('Only this variant, e.g. "desktop" or "mobile".'),
  ignore: z.enum(IGNORE_FILTERS).optional().describe('Only images whose rules (areas left out of the comparison) are: active, ever, applied, suppressed, fully-suppressed or needs-review.'),
  against: againstRunParam,
});

const diffOut = z
  .object({
    against: z.enum(['baseline', 'previous', 'compare']).describe('What the image was measured against: its approved baseline, the run before, or (compare) the image it is compared with — the run or capture asked for.'),
    state: z.enum(['pending', 'done', 'failed', 'too_large']),
    changedPixels: z.number(),
    changedPercent: z.number().describe('Changed pixels as a percentage of the image, anti-aliasing excluded.'),
    regions: z.number().describe('How many separate changed regions.'),
    sizeChanged: z.boolean(),
    contentMoved: z.boolean().describe('Rows were inserted or removed, so the rest of the page only shifted.'),
    withinTolerance: z.boolean(),
    summary: z.string(),
  })
  .nullable();

const captureOut = z.object({
  captureId: z.string(),
  variant: z.string(),
  status: z.string(),
  sameAsBaseline: z.boolean().nullable(),
  baselineRun: z.number().nullable(),
  comment: z.string().nullable(),
  autoApproved: z.boolean().describe('Approved by the project’s diff tolerance, not by a person.'),
  diff: diffOut.describe('The measured pixel comparison, when there is one: against the run in comparedWith when "against" was given.'),
  comparedWith: z
    .object({ run: z.number(), captureId: z.string(), same: z.boolean().describe('The very same pixels.') })
    .nullable()
    .optional()
    .describe('With "against": the same screen in the run it is compared with; null when that run did not capture it (status new).'),
  openThreads: z.number().optional().describe('Open comment threads on the image: see them pinned with get_review_checkpoint.'),
  ignore: z
    .object({ active: z.number(), applied: z.number(), suspended: z.number(), rawChangedPixels: z.number().nullable(), suppressedPixels: z.number().nullable(), states: z.array(z.enum(IGNORE_FILTERS)) })
    .optional()
    .describe('The checkpoint’s rules (areas left out) and what they did here; absent when none was ever saved.'),
});

function diffData(c: ComparedCapture): z.infer<typeof diffOut> {
  if (!c.diff || !c.diffAgainst) return null;
  return diffDataOf(c.diff, c.diffAgainst, c.withinTolerance);
}

const listOutput = output({
  project: z.string(),
  run: z.number(),
  reviewUrl: z.string(),
  against: z
    .object({ rule: z.string().describe('"previous" or "run:<n>".'), run: z.number().nullable().describe('The run compared with, when one run was named.') })
    .nullable()
    .optional()
    .describe('What every image was compared with, when "against" was given; absent: each image against its approved baseline, else the run before.'),
  counts: z.object({ approved: z.number(), changes_requested: z.number(), changed: z.number(), unchanged: z.number(), new: z.number() }),
  tests: z.array(
    z.object({
      title: z.string(),
      file: z.string(),
      project: z.string(),
      outcome: z.string(),
      checkpoints: z.array(
        z.object({
          order: z.number(),
          name: z.string(),
          title: z.string(),
          description: z.string().nullable(),
          steps: z.array(z.string()),
          url: z.string().nullable(),
          captures: z.array(captureOut),
        }),
      ),
    }),
  ),
});

export const listReviewCheckpoints = defineTool({
  name: 'list_review_checkpoints',
  title: 'List review checkpoints',
  toolset: 'core',
  description:
    "A run's review checkpoints — the named screenshots its tests capture at their milestones, per variant (desktop, mobile) — in journey order, with each image's status (changed vs its approved baseline, else the run before; unchanged; new: first capture; approved; changes requested), open comment threads and measured pixel change: share, regions, size change, moved content. Changes within the project's tolerance are approved automatically (autoApproved). Defaults to what needs review. Look at one with get_review_checkpoint.",
  input: listInput,
  output: listOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    const run = await resolveRun(project, args.run, { branch: args.branch });
    const filter = args.status ?? 'needs-review';
    const q = args.test?.toLowerCase();
    const flows = await runReview({ id: run.id, startedAt: run.startedAt });
    const rule = await againstRule(project, args.against, run.number);
    const compared = rule ? await compareRunRecords(project.project.id, flows, rule) : null;
    if (rule && !compared) throw notFound(`Run ${String(args.against)} not found in ${project.ref}.`, 'Pass "previous" or a run number from list_runs.');
    // Against a chosen run, every image's status and diff are that comparison's: the baseline plays no part.
    const statusOf = (c: ComparedCapture) => compared?.entries.get(c.id)?.status ?? c.status;
    const counts = emptyReviewCounts();
    const tests = flows
      .filter((f) => !q || f.title.toLowerCase().includes(q) || f.titlePath.join(' ').toLowerCase().includes(q) || f.file.toLowerCase().includes(q))
      .map((f) => ({
        title: f.titlePath.join(' › ') || f.title,
        file: f.file,
        project: f.project,
        outcome: f.outcome,
        checkpoints: f.checkpoints
          .map((cp) => {
            const captures = cp.captures.filter((c) => !args.variant || c.variant === args.variant);
            for (const c of captures) counts[statusOf(c)]++;
            return {
              order: cp.sequence + 1,
              name: cp.name,
              title: checkpointLabel(cp.name, cp.title),
              description: cp.description,
              steps: cp.stepPath,
              url: cp.url,
              captures: captures
                .filter((c) => matchesReviewFilter(statusOf(c), filter) && matchesIgnoreFilter(c.ignore, args.ignore))
                .map((c) => {
                  const e = compared?.entries.get(c.id);
                  return {
                  captureId: c.id,
                  variant: c.variant,
                  status: statusOf(c),
                  sameAsBaseline: c.baseline ? Boolean(c.sha256 && c.baseline.capture?.sha256 === c.sha256) : null,
                  baselineRun: c.baseline?.decision.runNumber ?? null,
                  comment: c.decision?.comment ?? null,
                  autoApproved: c.decision?.source === 'tolerance',
                  diff: compared ? measuredData(e?.measured ?? null) : diffData(c),
                  ...(compared ? { comparedWith: e?.reference ? { run: e.reference.runNumber, captureId: e.reference.capture.id, same: Boolean(c.sha256 && c.sha256 === e.reference.capture.sha256) } : null } : {}),
                  openThreads: c.threads.filter((t) => t.status === 'open').length,
                  ...(c.ignore.ever ? { ignore: { active: c.ignore.active, applied: c.ignore.applied, suspended: c.ignore.suspended, rawChangedPixels: c.ignore.rawChangedPixels, suppressedPixels: c.ignore.suppressedPixels, states: [...ignoreStates(c.ignore)] } } : {}),
                  };
                }),
            };
          })
          .filter((cp) => cp.captures.length > 0),
      }))
      .filter((t) => t.checkpoints.length > 0);
    const reviewUrl = `${project.links.run(run.number)}/review${rule ? `?against=${encodeURIComponent(rule)}` : ''}`;
    return {
      data: { project: project.ref, run: run.number, reviewUrl, ...(rule ? { against: { rule, run: compared?.runNumber ?? null } } : {}), counts, tests },
      render(md, d) {
        md.heading(`Review checkpoints of run #${d.run}${d.against ? ` compared with ${d.against.run ? `run #${d.against.run}` : 'the run before'}` : ''}`, 2);
        if (d.against) md.line('Statuses say what changed since that run, whatever was approved: unchanged (the same pixels), changed, or new (not captured there).');
        md.line(`${d.counts.changed} changed, ${d.counts.new} new, ${d.counts.unchanged} unchanged, ${d.counts.changes_requested} with changes requested, ${d.counts.approved} approved. ${link('Review in the app', d.reviewUrl)}`);
        if (d.tests.length === 0) {
          md.line(
            filter === 'needs-review'
              ? d.against
                ? 'Nothing changed since that run, or every change was decided about.'
                : 'Nothing needs review: every image was decided about, matches an approved one or, with none approved, the run before.'
              : 'No checkpoints match.',
          );
          return;
        }
        for (const t of d.tests) {
          md.heading(`${t.title} (${t.outcome}${t.project ? `, ${t.project}` : ''})`, 3);
          md.table(
            ['#', 'Checkpoint', 'Variant', 'Status', 'Measured change', 'Open threads', 'Capture id'],
            t.checkpoints.flatMap((cp) =>
              cp.captures.map((c) => [cp.order, cp.title, c.variant, (c.autoApproved ? 'approved (tolerance)' : c.status) + (c.comment && !c.autoApproved ? ` — "${c.comment}"` : ''), c.diff?.summary ?? '—', c.openThreads ?? 0, c.captureId]),
            ),
          );
        }
      },
    };
  },
});

// ---------------------------------------------------------------- get_review_checkpoint

/** The images one call attaches by default, and at most: a caller asks for fewer, never for a flood. */
const DEFAULT_MAX_IMAGES = 8;
const MAX_IMAGES = 12;

const AGAINST = ['auto', 'origin', 'baseline', 'previous'] as const;

const getInput = z.object({
  ...commonParams,
  capture: z.string().describe('Capture id, from list_review_checkpoints, list_feedback_requests or list_review_threads.'),
  against: z
    .enum(AGAINST)
    .optional()
    .describe(
      'What to compare with. origin: the image the focused thread (or a change request without a comment) was made on — what the request was about. baseline: the approved image. previous: the same checkpoint in the run before. auto (default): origin for a focused thread made on an earlier image, else the baseline, else the previous capture.',
    ),
  againstCapture: z.string().optional().describe('Compare with this capture id instead (any capture of the project), e.g. an original from list_feedback_requests.'),
  againstRun: runParam
    .optional()
    .describe('Compare with the same checkpoint and variant in this run (128, "#128", a run id or URL), whatever was approved: status, diff and close-ups then say what changed since that run.'),
  compare: z.boolean().optional().describe('Attach the image compared with. Default true.'),
  images: z
    .enum(['all', 'focus', 'none'])
    .optional()
    .describe('all (default): the full images, then close-ups. focus: close-ups only — the focused thread on this image and on the one compared with (or the changed regions) — readable on tall pages and small. none: text only.'),
  maxImages: z.number().int().min(1).max(MAX_IMAGES).optional().describe(`At most this many images (default ${DEFAULT_MAX_IMAGES}); the rest are listed as omitted.`),
  changes: z.boolean().optional().describe('Attach close-ups of the measured changed regions (up to 3), this image’s crop then the reference’s. Default true.'),
  pins: z.boolean().optional().describe('Draw the open comment threads on the image as numbered pins. Default true.'),
  thread: z.number().int().positive().optional().describe('Focus one comment thread by its number: its close-up is attached — on this image and on the one compared with — and its pin drawn even if resolved.'),
  pinCrops: z.boolean().optional().describe(`Attach a close-up around each pin. Default: when at most ${AUTO_CROPS} threads are open.`),
  includeResolved: z.boolean().optional().describe('Also list (and pin) resolved threads. Default false.'),
});

const rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const IMAGE_ROLES = ['image', 'compared', 'thread-close-up', 'compared-thread-close-up', 'change-close-up', 'compared-change-close-up'] as const;

const getOutput = output({
  project: z.string(),
  captureId: z.string(),
  test: z.string(),
  checkpoint: z.string(),
  variant: z.string(),
  run: z.number(),
  status: z
    .string()
    .describe(
      'The review status. Compared with the run before, another run, or a capture of the same screen: what changed since that image, whatever was approved — unchanged, changed (unless these pixels were approved), new (no such image), or changes_requested.',
    ),
  viewport: z.string().nullable(),
  sameAsReference: z.boolean().nullable(),
  reference: z.string().nullable().describe('What the image is compared with, in words.'),
  imageUrl: z.string(),
  referenceUrl: z.string().nullable(),
  comparison: z
    .object({
      role: z.enum(['origin', 'baseline', 'previous', 'run', 'capture']).describe('origin: the image a request was made on; baseline: the approved image; previous: the run before; run: the same screen in the run asked for; capture: the one asked for.'),
      captureId: z.string().nullable(),
      run: z.number().nullable(),
      reason: z.string().describe('Why this one.'),
      available: z.boolean().describe('Its image is stored and could be read.'),
      identical: z.boolean().nullable().describe('Same pixels as this image.'),
    })
    .nullable()
    .optional()
    .describe('The image compared with — chosen by "against" — kept apart from what the pixel diff was measured against.'),
  diff: diffOut.describe('The measured pixel change against the image compared with (against "compare" when that is not the default reference); changedRegions and the change close-ups are the same measurement.'),
  comparisonId: z.string().nullable().optional().describe('The pair shown (the image compared with → this image) for get_visual_diff and get_visual_diff_image: every region, raw and effective numbers, and images in any mode.'),
  measuredComparisonId: z.string().nullable().optional().describe('The pair the diff below was measured against, when it is another one.'),
  changedRegions: z.array(z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), pixels: z.number() })).describe('The changed regions, in the image’s pixels, largest first (up to 10).'),
  note: z.string().nullable(),
  image: z
    .object({ width: z.number(), height: z.number(), attachedWidth: z.number().nullable(), attachedHeight: z.number().nullable() })
    .nullable()
    .optional()
    .describe('The image’s size in pixels, and the size it was attached at (scaled to be readable).'),
  annotatedImageUrl: z.string().nullable().optional().describe('A short-lived link to the image with its open threads drawn on it as numbered pins.'),
  reviewUrl: z.string().optional().describe('The checkpoint in the app’s viewer: a stable link to hand over (image links expire).'),
  request: z
    .object({ by: z.string().nullable(), at: z.string(), run: z.number().nullable(), captureId: z.string().nullable(), onThisImage: z.boolean() })
    .nullable()
    .optional()
    .describe('A change request without a comment standing on this checkpoint: look at the image to see what should change.'),
  threads: z.array(threadOut).optional().describe('Comment threads on the image, by the numbers on its pins.'),
  drawings: z
    .array(
      z.object({
        tool: z.enum(MARKUP_TOOLS),
        color: z.enum(MARKUP_COLORS),
        by: z.string().nullable().describe('Who drew it.'),
        at: z.string(),
        pixels: rect.describe('The box it covers, in the image’s pixels.'),
        text: z.string(),
      }),
    )
    .optional()
    .describe('Drawings on the image on their own, without a comment (pen, highlighter, arrow, box, ellipse): what a reviewer marked to show what they mean. Drawn on the attached image under the pins.'),
  attachments: z.array(z.string()).optional().describe('What each attached image is, in order.'),
  attachedImages: z
    .array(
      z.object({
        index: z.number().describe('Position among the attached images, from 1.'),
        role: z.enum(IMAGE_ROLES),
        captureId: z.string(),
        run: z.number().nullable(),
        thread: z.number().nullable().describe('The thread a close-up is about.'),
        region: z.number().nullable().describe('The changed region a close-up is about, from 1, largest first.'),
        source: rect.nullable().describe('The rectangle shown, in that image’s pixels.'),
        width: z.number().nullable().describe('Attached size in pixels.'),
        height: z.number().nullable(),
      }),
    )
    .optional()
    .describe('One record per attached image, in order: which image, which part of it, at what size.'),
  omittedImages: z.array(z.string()).optional().describe('Images left out by maxImages or images; ask again with images "focus", a thread, or a higher maxImages.'),
});

/** At most this many regions come as close-ups; each is a pair of images. */
const MAX_CROPS = 3;
/** A close-up has this much context around the region, and is scaled down to at most this width. */
const CROP_MARGIN = 24;
const CROP_MAX_WIDTH = 800;

/** An image to attach, what it is called in the text, and its record without the position. */
type Attached = { image: ImageContent; label: string; meta: Omit<NonNullable<z.infer<typeof getOutput>['attachedImages']>[number], 'index'> };

/** A rectangle of an image with some context, scaled down to be read; `null` when it falls outside. */
async function cropRect(buf: Uint8Array, r: { x: number; y: number; width: number; height: number }) {
  const meta = await sharp(buf).metadata();
  const left = Math.max(0, r.x - CROP_MARGIN);
  const top = Math.max(0, r.y - CROP_MARGIN);
  const width = Math.min((meta.width ?? 0) - left, r.width + CROP_MARGIN * 2);
  const height = Math.min((meta.height ?? 0) - top, r.height + CROP_MARGIN * 2);
  if (width <= 0 || height <= 0) return null;
  const { data, info } = await sharp(buf).extract({ left, top, width, height }).resize({ width: Math.min(width, CROP_MAX_WIDTH), withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  return { image: { type: 'image' as const, data: data.toString('base64'), mimeType: 'image/png' }, source: { x: left, y: top, w: width, h: height }, width: info.width, height: info.height };
}

const asImage = (img: { data: Buffer; mimeType: string }): ImageContent => ({ type: 'image', data: img.data.toString('base64'), mimeType: img.mimeType });

/** A capture as an inline image, scaled and re-encoded to fit; with pins when there are any. `null` when it cannot be read. */
async function inlineCapture(capture: CaptureRecord, pins: Parameters<typeof annotate>[1], drawings: readonly MarkupShape[] = []) {
  const source = await readCaptureBytes(capture);
  if (!source) return null;
  try {
    const out = await annotate(source.bytes, pins, { maxBytes: inlineImageMaxBytes(), drawings });
    return { image: asImage(out), out, bytes: source.bytes };
  } catch {
    // Not an image sharp can read (an SVG, a truncated file): as it is, when small enough.
    if (source.bytes.byteLength > inlineImageMaxBytes()) return null;
    return { image: { type: 'image', data: Buffer.from(source.bytes).toString('base64'), mimeType: source.contentType } as ImageContent, out: null, bytes: source.bytes };
  }
}

const runNumberOf = async (runId: string) => (await db.select({ number: runs.number }).from(runs).where(eq(runs.id, runId)))[0]?.number ?? null;

interface Comparison {
  role: 'origin' | 'baseline' | 'previous' | 'run' | 'capture';
  capture: CaptureRecord | null;
  run: number | null;
  reason: string;
  label: string;
}

/**
 * The image to compare with. What a request was made on answers "was it
 * fixed?"; the approved image answers "what changed since it was accepted?";
 * the run before answers "what did this change do?". Never silently another
 * one: a reference that is gone is reported as gone.
 */
async function comparisonFor(
  capture: ComparedCapture,
  projectId: string,
  opts: { against: (typeof AGAINST)[number]; againstCapture?: string; againstRun?: number; focus?: CaptureThread },
): Promise<{ comparison: Comparison | null; missing: string | null }> {
  if (opts.againstRun !== undefined) {
    const other = await runCapturesByScreen(projectId, opts.againstRun);
    const c = other?.captures.get(identityKey(capture));
    if (!c) return { comparison: null, missing: `Run #${opts.againstRun} did not capture this checkpoint and variant (or its image is no longer stored).` };
    return { comparison: { role: 'run', capture: c, run: opts.againstRun, reason: `the same checkpoint in run #${opts.againstRun}`, label: `run #${opts.againstRun}` }, missing: null };
  }
  if (opts.againstCapture) {
    if (!isUuid(opts.againstCapture)) throw invalid('"againstCapture" is a capture id.');
    const [c] = await capturesById([opts.againstCapture.toLowerCase()]);
    if (!c || c.projectId !== projectId) throw notFound(`Capture ${opts.againstCapture} not found in this project.`, 'Use a capture id from list_feedback_requests or list_review_checkpoints.');
    const run = await runNumberOf(c.runId);
    const same = c.testId === capture.testId && c.checkpointName === capture.checkpointName && c.variant === capture.variant;
    return { comparison: { role: 'capture', capture: c, run, reason: same ? 'the capture asked for' : 'the capture asked for — another checkpoint or variant', label: `capture ${c.id}, run #${run ?? '?'}` }, missing: null };
  }
  const origin = async (): Promise<{ comparison: Comparison | null; missing: string | null } | null> => {
    const t = opts.focus;
    if (t && t.originCaptureId && t.originCaptureId !== capture.id) {
      const [c] = await capturesById([t.originCaptureId]);
      if (!c) return { comparison: null, missing: `The image thread #${t.number} was made on (run #${t.originRunNumber ?? '?'}) is no longer stored.` };
      return { comparison: { role: 'origin', capture: c, run: t.originRunNumber, reason: `the image thread #${t.number} was made on`, label: `the image commented on, run #${t.originRunNumber ?? '?'}` }, missing: null };
    }
    const r = capture.request;
    if (!t && r?.captureId && r.captureId !== capture.id && r.sha256 !== capture.sha256) {
      const [c] = await capturesById([r.captureId]);
      if (!c) return { comparison: null, missing: `The image changes were requested on (run #${r.runNumber ?? '?'}) is no longer stored.` };
      return { comparison: { role: 'origin', capture: c, run: r.runNumber, reason: 'the image changes were requested on', label: `the image changes were requested on, run #${r.runNumber ?? '?'}` }, missing: null };
    }
    return null;
  };
  const baseline = (): Comparison | null =>
    capture.baseline?.capture
      ? { role: 'baseline', capture: capture.baseline.capture, run: capture.baseline.decision.runNumber, reason: 'the approved image', label: `approved, run #${capture.baseline.decision.runNumber ?? '?'}` }
      : null;
  const previous = (): Comparison | null =>
    capture.previous ? { role: 'previous', capture: capture.previous.capture, run: capture.previous.runNumber, reason: 'the same checkpoint in the run before', label: `run #${capture.previous.runNumber}, the run before` } : null;

  if (opts.against === 'origin') {
    const o = await origin();
    return o ?? { comparison: null, missing: opts.focus ? `Thread #${opts.focus.number} was made on this image: there is no earlier one to compare.` : 'No earlier image a request was made on: focus a thread with "thread".' };
  }
  if (opts.against === 'baseline') {
    const b = baseline();
    return b ? { comparison: b, missing: null } : { comparison: null, missing: capture.baseline ? 'The approved image is no longer stored.' : 'Nobody approved this checkpoint yet: there is no baseline.' };
  }
  if (opts.against === 'previous') {
    const p = previous();
    return p ? { comparison: p, missing: null } : { comparison: null, missing: 'No earlier run captured this checkpoint and variant.' };
  }
  // auto
  const o = opts.focus?.placement === 'outdated' ? await origin() : null;
  if (o?.comparison) return o;
  const b = baseline();
  if (b) return { comparison: b, missing: o?.missing ?? null };
  const p = previous();
  const why = capture.baseline ? 'The approved image is no longer stored' : 'Nobody approved this checkpoint yet';
  if (p) return { comparison: { ...p, reason: `${why}: the run before instead` }, missing: o?.missing ?? null };
  return { comparison: null, missing: [o?.missing, `${why}, and no earlier run captured it.`].filter(Boolean).join(' ') };
}

export const getReviewCheckpoint = defineTool({
  name: 'get_review_checkpoint',
  title: 'Get a review checkpoint',
  toolset: 'core',
  description:
    'One review checkpoint image to look at, beside the image it is compared with — the one a request was made on (against "origin"), the approved baseline, the run before, or the same screen in any run (againstRun) — with the measured change and close-ups of the largest changed regions. Open comment threads are drawn as numbered pins, a close-up per pin follows, and the threads are listed by the same numbers. images "focus" with a thread attaches just that spot, then and now: readable on tall pages, and small. Each attached image is described in attachedImages.',
  input: getInput,
  output: getOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { artifact: ['read'] });
    if (!isUuid(args.capture)) throw invalid('"capture" is a capture id, from list_review_checkpoints.');
    const found = await captureInProject(project.project.id, args.capture.toLowerCase());
    if (!found) throw notFound(`Capture ${args.capture} not found in ${project.ref}.`, 'Call list_review_checkpoints for the ids.');
    const { capture } = found;
    const mode = args.images ?? 'all';
    const maxImages = args.maxImages ?? DEFAULT_MAX_IMAGES;
    const shownThreads = capture.threads.filter((t) => args.includeResolved || t.status === 'open' || t.number === args.thread);
    const focus = args.thread != null ? capture.threads.find((t) => t.number === args.thread) : undefined;
    if (args.thread != null && !focus) throw notFound(`This image has no thread #${args.thread}.`, 'The threads are listed without "thread".');
    const pins = args.pins === false ? [] : pinSpecs(shownThreads, true);
    // Drawings made on these pixels on their own, without a comment: drawn under the pins.
    const drawings = args.pins === false ? [] : capture.drawings.map((d) => d.position);
    const compare = args.compare ?? true;
    if (args.againstRun !== undefined && args.againstCapture) throw invalid('Pass "againstRun" or "againstCapture", not both.');
    const againstRun = args.againstRun !== undefined ? (await resolveRun(project, args.againstRun)).number : undefined;
    if (againstRun === found.runNumber) throw invalid(`"againstRun" names run #${againstRun}, this image's own run.`);
    const { comparison, missing } = await comparisonFor(capture, project.project.id, { against: args.against ?? 'auto', againstCapture: args.againstCapture, againstRun, focus });
    const reference = comparison?.capture ?? null;
    const defaultMeasured = capture.diffAgainst === 'baseline' ? (capture.baseline?.capture ?? null) : capture.diffAgainst === 'previous' ? (capture.previous?.capture ?? null) : null;
    // Compared with another image than the default reference: measured against that one, never silently against the baseline.
    const remeasured = reference && reference.id !== defaultMeasured?.id ? ((await measureEach([capture], () => ({ capture: reference, label: comparison!.label }))).get(capture.id) ?? null) : null;
    const measuredAgainst = remeasured ? reference : defaultMeasured;
    const measuredDiff = remeasured ? remeasured.diff : capture.diff;
    const measuredLabel = remeasured ? comparison!.label : capture.diffAgainst === 'baseline' ? 'the approved image' : 'the run before';
    const measuredRun = remeasured ? (comparison?.run ?? null) : capture.diffAgainst === 'baseline' ? (capture.baseline?.decision.runNumber ?? null) : (capture.previous?.runNumber ?? null);
    // Against the run before, another run or a capture of the same screen: did it change since, whatever was approved.
    const sameScreen = (c: CaptureRecord) => c.testId === capture.testId && c.checkpointName === capture.checkpointName && c.variant === capture.variant;
    const sinceRun = args.againstRun !== undefined || args.against === 'previous' || (comparison?.role === 'capture' && reference !== null && sameScreen(reference));
    const status = sinceRun ? statusAgainstRun({ decision: capture.decision?.decision, sha256: capture.sha256, reference }) : capture.status;

    // Candidates in the order they matter; the budget keeps the first ones.
    const attached: Attached[] = [];
    const omitted: string[] = [];
    const add = (a: Attached) => (attached.length < maxImages ? attached.push(a) : omitted.push(a.label));
    const skip = (label: string) => omitted.push(label);
    const own = { captureId: capture.id, run: found.runNumber };

    const wantsFull = mode === 'all';
    const main = mode === 'none' ? null : await inlineCapture(capture, wantsFull ? pins : [], wantsFull ? drawings : []);
    if (main && wantsFull)
      add({
        image: main.image,
        label: pins.length ? `this run’s image, with the open threads pinned${drawings.length ? ' and its drawings' : ''}` : drawings.length ? 'this run’s image, with its drawings' : 'this run’s image',
        meta: { role: 'image', ...own, thread: null, region: null, source: main.out ? { x: 0, y: 0, w: main.out.source.width, h: main.out.source.height } : null, width: main.out?.width ?? null, height: main.out?.height ?? null },
      });
    else if (main && mode === 'focus') skip('this image in full (images "all")');
    const refImage = compare && reference && mode !== 'none' ? await inlineCapture(reference, []) : null;
    const refMeta = { captureId: reference?.id ?? '', run: comparison?.run ?? null };
    if (refImage && wantsFull)
      add({
        image: refImage.image,
        label: comparison!.label,
        meta: { role: 'compared', ...refMeta, thread: null, region: null, source: refImage.out ? { x: 0, y: 0, w: refImage.out.source.width, h: refImage.out.source.height } : null, width: refImage.out?.width ?? null, height: refImage.out?.height ?? null },
      });
    else if (refImage && mode === 'focus') skip(`${comparison!.label} in full (images "all")`);

    const maxCropBytes = Math.max(64 * 1024, Math.floor(inlineImageMaxBytes() / 2));
    // The focused thread, then and now: on this image, and where it was placed on the image compared with.
    const threadCrop = async (t: CaptureThread, withCompared: boolean) => {
      const spec = pins.find((p) => p.number === t.number) ?? pinSpecs([t], true)[0];
      if (!spec || !main?.bytes) return;
      const crop = await cropAround(main.bytes, spec, pins, { maxBytes: maxCropBytes, drawings }).catch(() => null);
      if (crop) add({ image: asImage(crop), label: `a close-up of #${t.number}`, meta: { role: 'thread-close-up', ...own, thread: t.number, region: null, source: crop.region, width: crop.width, height: crop.height } });
      if (!withCompared || !refImage?.bytes || !reference) return;
      const onOrigin = comparison?.role === 'origin' && t.originCaptureId === reference.id;
      const anchor = onOrigin ? projectAnchor(t.anchor, t.origin, t.origin) : spec.anchor;
      const refSpec = { ...spec, placement: 'exact' as const, anchor };
      const refCrop = await cropAround(refImage.bytes, refSpec, [refSpec], { maxBytes: maxCropBytes }).catch(() => null);
      if (refCrop)
        add({
          image: asImage(refCrop),
          label: `a close-up of #${t.number} on ${comparison!.label}${onOrigin ? ', where it was placed' : ', at the same spot'}`,
          meta: { role: 'compared-thread-close-up', ...refMeta, thread: t.number, region: null, source: refCrop.region, width: refCrop.width, height: refCrop.height },
        });
    };
    if (focus && mode !== 'none' && args.pins !== false) await threadCrop(focus, compare);

    // The largest measured changes, this image then the one they were measured against.
    const regions = [...(measuredDiff?.regions ?? [])].sort((a, b) => b.pixels - a.pixels).slice(0, MAX_CROPS);
    if ((args.changes ?? true) && measuredDiff?.status === 'done' && regions.length && mode !== 'none' && (mode === 'all' || !focus) && main?.bytes) {
      const measured = measuredAgainst ? await readCaptureBytes(measuredAgainst) : null;
      for (const [i, r] of regions.entries()) {
        const h = await cropRect(main.bytes, r).catch(() => null);
        if (h) add({ image: h.image, label: `change ${i + 1}, this image`, meta: { role: 'change-close-up', ...own, thread: null, region: i + 1, source: h.source, width: h.width, height: h.height } });
        const b = measured ? await cropRect(measured.bytes, r).catch(() => null) : null;
        if (b && measuredAgainst)
          add({
            image: b.image,
            label: `change ${i + 1}, ${measuredLabel}`,
            meta: { role: 'compared-change-close-up', captureId: measuredAgainst.id, run: measuredRun, thread: null, region: i + 1, source: b.source, width: b.width, height: b.height },
          });
      }
    }

    // A close-up per pin, when there are few.
    const cropTargets =
      mode !== 'all' || args.pins === false
        ? []
        : focus
          ? []
          : args.pinCrops === false || (args.pinCrops !== true && shownThreads.filter((t) => t.status === 'open').length > AUTO_CROPS)
            ? []
            : shownThreads;
    for (const t of cropTargets) await threadCrop(t, false);

    const notes = [
      !main && mode !== 'none' ? 'The image is not available to attach; open the link.' : null,
      compare && missing ? missing : null,
      compare && reference && !refImage && mode !== 'none' ? `${comparison!.label} could not be read to attach.` : null,
      remeasured?.pending ? `The difference from ${comparison!.label} is being measured: ask again in a moment.` : null,
      focus?.placement === 'outdated' && comparison?.role !== 'origin' ? `Thread #${focus.number} was placed on an earlier image and its pin here is carried over — it may be off: compare against "origin".` : null,
    ].filter(Boolean);
    const threads = shownThreads.map((t) => toThreadOut(t, capture, reviewUrl(project.links, found.runNumber, capture, t.number)));
    const hidden = capture.threads.length - shownThreads.length;
    const r = capture.request && !capture.request.comment ? capture.request : null;
    const data = {
      project: project.ref,
      captureId: capture.id,
      test: found.testTitle,
      checkpoint: checkpointLabel(capture.checkpointName, found.checkpointTitle),
      variant: capture.variant,
      run: found.runNumber,
      status,
      viewport: capture.viewportWidth ? `${capture.viewportWidth}×${capture.viewportHeight}${capture.deviceScaleFactor ? ` @${capture.deviceScaleFactor}x` : ''}` : null,
      sameAsReference: reference ? Boolean(capture.sha256 && reference.sha256 === capture.sha256) : null,
      reference: comparison ? comparison.label : null,
      imageUrl: ctx.artifactUrl(capture.attachment.id),
      referenceUrl: reference ? ctx.artifactUrl(reference.attachment.id) : null,
      comparison: comparison
        ? {
            role: comparison.role,
            captureId: reference?.id ?? null,
            run: comparison.run,
            reason: comparison.reason,
            available: Boolean(refImage) || (mode === 'none' && reference?.attachment.status === 'uploaded'),
            identical: reference ? Boolean(capture.sha256 && reference.sha256 === capture.sha256) : null,
          }
        : null,
      diff: remeasured ? measuredData(remeasured) : diffData(capture),
      comparisonId: reference ? encodeComparisonId(reference.id, capture.id) : null,
      measuredComparisonId: measuredAgainst && measuredAgainst.id !== reference?.id ? encodeComparisonId(measuredAgainst.id, capture.id) : null,
      changedRegions: [...(measuredDiff?.regions ?? [])].sort((a, b) => b.pixels - a.pixels).slice(0, 10),
      note: [...notes, hidden > 0 ? `${hidden} resolved thread${hidden === 1 ? '' : 's'} not shown (includeResolved).` : null].filter(Boolean).join(' ') || null,
      image: main?.out
        ? { width: main.out.source.width, height: main.out.source.height, attachedWidth: wantsFull ? main.out.width : null, attachedHeight: wantsFull ? main.out.height : null }
        : capture.width && capture.height
          ? { width: capture.width, height: capture.height, attachedWidth: null, attachedHeight: null }
          : null,
      annotatedImageUrl: capture.attachment.status === 'uploaded' ? `${baseUrl()}${signCaptureImagePath(capture.id, artifactUrlTtlSeconds())}` : null,
      reviewUrl: reviewUrl(project.links, found.runNumber, capture),
      request: r ? { by: r.by, at: r.createdAt.toISOString(), run: r.runNumber, captureId: r.captureId, onThisImage: r.captureId === capture.id || Boolean(r.sha256 && r.sha256 === capture.sha256) } : null,
      threads,
      ...(capture.drawings.length ? { drawings: captureDrawings(capture.drawings, capture) } : {}),
      attachments: attached.map((a) => a.label),
      attachedImages: attached.map((a, i) => ({ index: i + 1, ...a.meta })),
      ...(omitted.length ? { omittedImages: omitted } : {}),
    };
    return {
      data,
      images: attached.map((a) => a.image),
      render(md, d) {
        md.heading(`${d.checkpoint} — ${d.variant} (run #${d.run})`, 2);
        md.kv([
          ['Test', d.test],
          ['Status', d.status],
          ['Viewport', d.viewport],
          ['Image', d.image ? `${d.image.width}×${d.image.height} px${d.image.attachedWidth && d.image.attachedWidth !== d.image.width ? `, attached at ${d.image.attachedWidth}×${d.image.attachedHeight}` : ''}` : null],
          ['Compared with', d.comparison ? `${d.reference} (${d.comparison.reason}): ${d.comparison.identical ? 'identical' : 'different'}` : null],
          ['Measured change', d.diff ? `${d.diff.summary} (against ${d.diff.against === 'baseline' ? 'the approved baseline' : d.diff.against === 'previous' ? 'the run before' : (d.reference ?? 'the image compared with')})${d.diff.withinTolerance ? ', within the tolerance' : ''}` : null],
          ['Change request', d.request ? `${d.request.by ?? 'Someone'} asked for changes without a comment (run #${d.request.run ?? '?'})${d.request.onThisImage ? ' on this image' : ' on an earlier image — this one changed since'}` : null],
          ['In the app', d.reviewUrl ?? null],
          ['Image link', d.imageUrl],
          ['With pins', threads.length ? (d.annotatedImageUrl ?? null) : null],
          ['Compared image', d.referenceUrl],
          ['Comparison', d.comparisonId ? `${d.comparisonId} — get_visual_diff lists every region raw and effective; get_visual_diff_image shows them in any mode` : null],
        ]);
        if (d.attachments?.length) md.line(`Attached, in order: ${d.attachments.map((a, i) => `${i + 1}. ${a}`).join('; ')}.`);
        if (d.omittedImages?.length) md.line(`Not attached: ${d.omittedImages.join('; ')}. Ask with images "focus" and a thread, or a higher maxImages.`);
        if (d.threads?.length) {
          md.heading(`Comment threads (${d.threads.filter((t) => t.status === 'open').length} open) — the numbers are the pins on the image`, 3);
          for (const t of d.threads) renderThread(md, t, threadPosition(shownThreads.find((x) => x.number === t.number)!, capture).text);
          md.line('Pixels are the image’s (at its device scale), not CSS pixels. A changed image is evidence to check, not an approval: leave resolving to the reviewer, and reply with comment_on_review only when the user asked you to.');
        } else md.line('No open comment threads on this image.');
        if (d.drawings?.length) {
          md.heading(`Drawings (${d.drawings.length}) — drawn on the image, without a comment`, 3);
          for (const x of d.drawings) md.line(`- ${x.text}${x.by ? ` — by ${x.by}` : ''}`);
        }
        if (d.note) md.line(d.note);
      },
    };
  },
});

// ---------------------------------------------------------------- review_checkpoint

const decideInput = z.object({
  ...commonParams,
  captures: z.array(z.string()).min(1).max(MAX_DECISION_CAPTURES).describe('Capture ids, from list_review_checkpoints.'),
  decision: z.enum(REVIEW_DECISIONS).describe('approved, or changes_requested.'),
  comment: z.string().max(4000).optional().describe('Why — what should change. Opens a thread about the whole image with a change request.'),
  pins: z
    .array(percentAnchor.extend({ comment: z.string().min(1).max(MAX_COMMENT_LENGTH).describe('What should change there.') }))
    .max(20)
    .optional()
    .describe('With changes_requested on one capture: pin each change where it is, in percent of the image, as a numbered thread.'),
  resolveThreads: z.boolean().optional().describe('With approved: also resolve the images’ open threads (their changes are done).'),
  agent: agentParam,
});

const decideOutput = output({
  project: z.string(),
  decided: z.number(),
  decision: z.string(),
  pinned: z.array(z.object({ number: z.number(), url: z.string() })).optional(),
  resolvedThreads: z.number().optional(),
});

export const reviewCheckpoint = defineTool({
  name: 'review_checkpoint',
  title: 'Approve or reject review checkpoints',
  toolset: 'write',
  description:
    'Approve review checkpoint images, or ask for changes — with a comment, and on one image with pins that mark each change where it is. An approval holds for the exact pixels: later runs with the same image need no review. Only approve what you looked at with get_review_checkpoint.',
  input: decideInput,
  output: decideOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { review: ['decide'] });
    const ids = args.captures.map((c) => c.toLowerCase());
    if (ids.some((id) => !isUuid(id))) throw invalid('"captures" are capture ids, from list_review_checkpoints.');
    if (args.pins?.length && (ids.length !== 1 || args.decision !== 'changes_requested')) throw invalid('"pins" go with changes_requested on exactly one capture.');
    const { decided, resolvedThreads } = await decide({
      projectId: project.project.id,
      captureIds: ids,
      decision: args.decision,
      comment: args.comment,
      userId: project.user.id,
      resolveThreads: args.resolveThreads,
      commentSource: 'mcp',
      agentName: agentNameFor(args.agent, ctx),
    }).catch((error: unknown) => {
      if (error instanceof ReviewError) throw invalid(error.message);
      throw error;
    });
    const pinned: { number: number; url: string }[] = [];
    if (args.pins?.length) {
      const found = await captureInProject(project.project.id, ids[0]);
      for (const pin of args.pins) {
        const thread = await createThread({ projectId: project.project.id, captureId: ids[0], anchor: fromPercent(pin), body: pin.comment, author: { userId: project.user.id, source: 'mcp', agentName: agentNameFor(args.agent, ctx) } }).catch((error: unknown) => {
          if (error instanceof ThreadError) throw invalid(error.message);
          throw error;
        });
        pinned.push({ number: thread.number, url: found ? reviewUrl(project.links, found.runNumber, found.capture, thread.number) : '' });
      }
    }
    return {
      data: { project: project.ref, decided, decision: args.decision, ...(pinned.length ? { pinned } : {}), ...(resolvedThreads ? { resolvedThreads } : {}) },
      render(md, d) {
        md.line(`${d.decided} image${d.decided === 1 ? '' : 's'} ${d.decision === 'approved' ? 'approved' : 'marked for changes'}.`);
        if (d.pinned?.length) md.line(`Pinned ${d.pinned.map((p) => `#${p.number}`).join(', ')}: ${link('see them in the app', d.pinned[0].url)}.`);
        if (d.resolvedThreads) md.line(`${d.resolvedThreads} open thread${d.resolvedThreads === 1 ? '' : 's'} resolved.`);
      },
    };
  },
});

export const REVIEW_TOOLS = [listReviewCheckpoints, getReviewCheckpoint, reviewCheckpoint];
