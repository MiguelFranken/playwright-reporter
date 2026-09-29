/**
 * Review checkpoints for assistants: what a run's journeys looked like, which
 * images changed against their approved baseline, the images themselves — and,
 * with a write-scoped token, the decision. An agent that changed the UI can
 * look at its own work before a human does, and hand the human only what
 * really changed.
 */
import type { ImageContent } from '@modelcontextprotocol/server';
import sharp from 'sharp';
import { z } from 'zod';
import { checkpointLabel, describeDiff, matchesReviewFilter, REVIEW_DECISIONS, REVIEW_FILTERS } from '@miguelfranken/ui/lib/review';
import { getStorage } from '@/lib/storage';
import { db } from '@/lib/db/drizzle';
import { attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { captureInProject, decide, MAX_DECISION_CAPTURES, ReviewError, runReview, type CaptureRecord, type ComparedCapture } from '@/lib/review/queries';
import { toDiffView } from '@/lib/review/view-model';
import { inlineImageMaxBytes } from '../config';
import { invalid, notFound } from '../errors';
import { branchParam, commonParams, isUuid, runParam } from '../params';
import { defineTool, output } from '../registry';
import { link } from '../render/markdown';
import { resolveRun } from '../resolve';
import { readAll } from './get-artifact';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;

// ---------------------------------------------------------------- list_review_checkpoints

const listInput = z.object({
  ...commonParams,
  run: runParam.optional().describe('The run (default "latest"). Scope "latest" with branch.'),
  branch: branchParam,
  status: z
    .enum(REVIEW_FILTERS)
    .optional()
    .describe('needs-review (default: changed and new images), all, changed, new, changes_requested or approved.'),
  test: z.string().optional().describe('Part of a test title or file, to narrow the list.'),
  variant: z.string().optional().describe('Only this variant, e.g. "desktop" or "mobile".'),
});

const diffOut = z
  .object({
    against: z.enum(['baseline', 'previous', 'compare']).describe('What the image was measured against: its approved baseline, else the run before.'),
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
  diff: diffOut.describe('The measured pixel comparison, when there is one.'),
});

function diffData(c: ComparedCapture): z.infer<typeof diffOut> {
  if (!c.diff || !c.diffAgainst) return null;
  const v = toDiffView(c.diff, c.diffAgainst, c.withinTolerance);
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

const listOutput = output({
  project: z.string(),
  run: z.number(),
  reviewUrl: z.string(),
  counts: z.object({ approved: z.number(), changes_requested: z.number(), changed: z.number(), new: z.number() }),
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
    "A run's review checkpoints — the named screenshots its tests capture at their milestones, per variant (desktop, mobile) — in journey order, with each image's review status (changed against its approved baseline, new, approved or changes requested) and its measured pixel change: how much of the image changed, in how many regions, whether the page changed size or its content moved. Changes within the project's tolerance are approved automatically (autoApproved). Defaults to what needs review. Look at one with get_review_checkpoint.",
  input: listInput,
  output: listOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    const run = await resolveRun(project, args.run, { branch: args.branch });
    const filter = args.status ?? 'needs-review';
    const q = args.test?.toLowerCase();
    const flows = await runReview({ id: run.id, startedAt: run.startedAt });
    const counts = { approved: 0, changes_requested: 0, changed: 0, new: 0 };
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
            for (const c of captures) counts[c.status]++;
            return {
              order: cp.sequence + 1,
              name: cp.name,
              title: checkpointLabel(cp.name, cp.title),
              description: cp.description,
              steps: cp.stepPath,
              url: cp.url,
              captures: captures
                .filter((c) => matchesReviewFilter(c.status, filter))
                .map((c) => ({
                  captureId: c.id,
                  variant: c.variant,
                  status: c.status,
                  sameAsBaseline: c.baseline ? Boolean(c.sha256 && c.baseline.capture?.sha256 === c.sha256) : null,
                  baselineRun: c.baseline?.decision.runNumber ?? null,
                  comment: c.decision?.comment ?? null,
                  autoApproved: c.decision?.source === 'tolerance',
                  diff: diffData(c),
                })),
            };
          })
          .filter((cp) => cp.captures.length > 0),
      }))
      .filter((t) => t.checkpoints.length > 0);
    const reviewUrl = `${project.links.run(run.number)}/review`;
    return {
      data: { project: project.ref, run: run.number, reviewUrl, counts, tests },
      render(md, d) {
        md.heading(`Review checkpoints of run #${d.run}`, 2);
        md.line(`${d.counts.changed} changed, ${d.counts.new} new, ${d.counts.changes_requested} with changes requested, ${d.counts.approved} approved. ${link('Review in the app', d.reviewUrl)}`);
        if (d.tests.length === 0) {
          md.line(filter === 'needs-review' ? 'Nothing needs review: every image matches an approved one or was decided about.' : 'No checkpoints match.');
          return;
        }
        for (const t of d.tests) {
          md.heading(`${t.title} (${t.outcome}${t.project ? `, ${t.project}` : ''})`, 3);
          md.table(
            ['#', 'Checkpoint', 'Variant', 'Status', 'Measured change', 'Capture id'],
            t.checkpoints.flatMap((cp) =>
              cp.captures.map((c) => [cp.order, cp.title, c.variant, (c.autoApproved ? 'approved (tolerance)' : c.status) + (c.comment && !c.autoApproved ? ` — "${c.comment}"` : ''), c.diff?.summary ?? '—', c.captureId]),
            ),
          );
        }
      },
    };
  },
});

// ---------------------------------------------------------------- get_review_checkpoint

const getInput = z.object({
  ...commonParams,
  capture: z.string().describe('Capture id, from list_review_checkpoints.'),
  compare: z.boolean().optional().describe('Also attach the approved baseline image (or the previous run’s) to compare with. Default true.'),
  changes: z.boolean().optional().describe('Attach close-ups of the measured changed regions (up to 3), this run’s crop then the reference’s. Default true.'),
});

const getOutput = output({
  project: z.string(),
  captureId: z.string(),
  test: z.string(),
  checkpoint: z.string(),
  variant: z.string(),
  run: z.number(),
  status: z.string(),
  viewport: z.string().nullable(),
  sameAsReference: z.boolean().nullable(),
  reference: z.string().nullable(),
  imageUrl: z.string(),
  referenceUrl: z.string().nullable(),
  diff: diffOut,
  changedRegions: z.array(z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), pixels: z.number() })).describe('The changed regions, in the image’s pixels, largest first (up to 10).'),
  note: z.string().nullable(),
});

/** At most this many regions come as close-ups; each is a pair of images. */
const MAX_CROPS = 3;
/** A close-up has this much context around the region, and is scaled down to at most this width. */
const CROP_MARGIN = 24;
const CROP_MAX_WIDTH = 800;

async function imageBytes(capture: CaptureRecord): Promise<Buffer | null> {
  if (capture.attachment.status !== 'uploaded') return null;
  const [row] = await db.select({ storageKey: attachments.storageKey }).from(attachments).where(eq(attachments.id, capture.attachment.id));
  const object = row ? await getStorage().get(row.storageKey) : null;
  return object ? Buffer.from(await new Response(object.stream).arrayBuffer()) : null;
}

/**
 * Close-ups of the largest changes: the region with some context, from this
 * run's image and the same rectangle of the reference, so an agent can say
 * what changed without reading a 3000-pixel page.
 */
async function regionCrops(capture: ComparedCapture, reference: CaptureRecord | null): Promise<ImageContent[]> {
  const regions = [...(capture.diff?.regions ?? [])].sort((a, b) => b.pixels - a.pixels).slice(0, MAX_CROPS);
  if (!regions.length) return [];
  const [head, base] = await Promise.all([imageBytes(capture), reference ? imageBytes(reference) : null]);
  if (!head) return [];
  const crop = async (buf: Buffer, r: (typeof regions)[number]) => {
    const meta = await sharp(buf).metadata();
    const left = Math.max(0, r.x - CROP_MARGIN);
    const top = Math.max(0, r.y - CROP_MARGIN);
    const width = Math.min((meta.width ?? 0) - left, r.width + CROP_MARGIN * 2);
    const height = Math.min((meta.height ?? 0) - top, r.height + CROP_MARGIN * 2);
    if (width <= 0 || height <= 0) return null;
    const png = await sharp(buf).extract({ left, top, width, height }).resize({ width: Math.min(width, CROP_MAX_WIDTH), withoutEnlargement: true }).png().toBuffer();
    return { type: 'image' as const, data: png.toString('base64'), mimeType: 'image/png' };
  };
  const out: ImageContent[] = [];
  for (const r of regions) {
    const h = await crop(head, r).catch(() => null);
    if (h) out.push(h);
    const b = base ? await crop(base, r).catch(() => null) : null;
    if (b) out.push(b);
  }
  return out;
}

async function inlineImage(capture: CaptureRecord): Promise<ImageContent | null> {
  if (capture.attachment.status !== 'uploaded') return null;
  const [row] = await db.select({ storageKey: attachments.storageKey, sizeBytes: attachments.sizeBytes, contentType: attachments.contentType }).from(attachments).where(eq(attachments.id, capture.attachment.id));
  if (!row || (row.sizeBytes ?? 0) > inlineImageMaxBytes()) return null;
  const object = await getStorage().get(row.storageKey);
  if (!object) return null;
  const { bytes, complete } = await readAll(object.stream, inlineImageMaxBytes());
  return complete ? { type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType: row.contentType } : null;
}

export const getReviewCheckpoint = defineTool({
  name: 'get_review_checkpoint',
  title: 'Get a review checkpoint',
  toolset: 'core',
  description:
    'One review checkpoint image to look at, with its approved baseline (or the previous run’s capture) beside it, the measured change (changed pixels, regions in image pixels) and close-ups of the largest changed regions, so you can say what changed. Full-page images may be tall; a large one comes as a link, but its close-ups still come attached.',
  input: getInput,
  output: getOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { artifact: ['read'] });
    if (!isUuid(args.capture)) throw invalid('"capture" is a capture id, from list_review_checkpoints.');
    const found = await captureInProject(project.project.id, args.capture.toLowerCase());
    if (!found) throw notFound(`Capture ${args.capture} not found in ${project.ref}.`, 'Call list_review_checkpoints for the ids.');
    const { capture } = found;
    const reference = capture.baseline?.capture ?? null;
    const measuredAgainst = capture.diffAgainst === 'baseline' ? reference : capture.diffAgainst === 'previous' ? (capture.previous?.capture ?? null) : null;
    const images: ImageContent[] = [];
    const main = await inlineImage(capture);
    if (main) images.push(main);
    const compare = args.compare ?? true;
    const ref = compare && reference ? await inlineImage(reference) : null;
    if (ref) images.push(ref);
    const crops = (args.changes ?? true) && capture.diff?.status === 'done' ? await regionCrops(capture, measuredAgainst) : [];
    images.push(...crops);
    const notes = [
      !main ? 'The image is too large (or not available) to attach; open the link.' : null,
      compare && reference && !ref ? 'The baseline is too large (or gone) to attach.' : null,
      compare && !reference ? 'Nobody approved this checkpoint yet: there is no baseline.' : null,
    ].filter(Boolean);
    const data = {
      project: project.ref,
      captureId: capture.id,
      test: found.testTitle,
      checkpoint: checkpointLabel(capture.checkpointName, found.checkpointTitle),
      variant: capture.variant,
      run: found.runNumber,
      status: capture.status,
      viewport: capture.viewportWidth ? `${capture.viewportWidth}×${capture.viewportHeight}${capture.deviceScaleFactor ? ` @${capture.deviceScaleFactor}x` : ''}` : null,
      sameAsReference: reference ? Boolean(capture.sha256 && reference.sha256 === capture.sha256) : null,
      reference: reference ? `approved, run #${capture.baseline!.decision.runNumber ?? '?'}` : null,
      imageUrl: ctx.artifactUrl(capture.attachment.id),
      referenceUrl: reference ? ctx.artifactUrl(reference.attachment.id) : null,
      diff: diffData(capture),
      changedRegions: [...(capture.diff?.regions ?? [])].sort((a, b) => b.pixels - a.pixels).slice(0, 10),
      note: notes.join(' ') || null,
    };
    return {
      data,
      images,
      render(md, d) {
        md.heading(`${d.checkpoint} — ${d.variant} (run #${d.run})`, 2);
        md.kv([
          ['Test', d.test],
          ['Status', d.status],
          ['Viewport', d.viewport],
          ['Compared with', d.reference ? `${d.reference}: ${d.sameAsReference ? 'identical' : 'different'}` : null],
          ['Measured change', d.diff ? `${d.diff.summary} (against the ${d.diff.against === 'baseline' ? 'approved baseline' : 'run before'})${d.diff.withinTolerance ? ', within the tolerance' : ''}` : null],
          ['Image', d.imageUrl],
          ['Baseline', d.referenceUrl],
        ]);
        if (main) md.line(ref ? 'The first image is this run’s, the second the approved baseline.' : 'The image is attached below.');
        if (crops.length) md.line(`Then close-ups of the ${Math.min(MAX_CROPS, d.changedRegions.length)} largest changed regions${measuredAgainst ? ', each this run’s crop followed by the reference’s' : ''}.`);
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
  comment: z.string().max(4000).optional().describe('Why — what should change. Shown to the reviewer beside the image.'),
});

const decideOutput = output({ project: z.string(), decided: z.number(), decision: z.string() });

export const reviewCheckpoint = defineTool({
  name: 'review_checkpoint',
  title: 'Approve or reject review checkpoints',
  toolset: 'write',
  description:
    'Approve review checkpoint images, or ask for changes with a comment. An approval holds for the exact pixels: later runs with the same image need no review. Only approve what you looked at with get_review_checkpoint.',
  input: decideInput,
  output: decideOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { review: ['decide'] });
    const ids = args.captures.map((c) => c.toLowerCase());
    if (ids.some((id) => !isUuid(id))) throw invalid('"captures" are capture ids, from list_review_checkpoints.');
    const { decided } = await decide({ projectId: project.project.id, captureIds: ids, decision: args.decision, comment: args.comment, userId: project.user.id }).catch((error: unknown) => {
      if (error instanceof ReviewError) throw invalid(error.message);
      throw error;
    });
    return {
      data: { project: project.ref, decided, decision: args.decision },
      render(md, d) {
        md.line(`${d.decided} image${d.decided === 1 ? '' : 's'} ${d.decision === 'approved' ? 'approved' : 'marked for changes'}.`);
      },
    };
  },
});

export const REVIEW_TOOLS = [listReviewCheckpoints, getReviewCheckpoint, reviewCheckpoint];
