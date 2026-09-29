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
import { z } from 'zod';
import { checkpointLabel, matchesReviewFilter, REVIEW_DECISIONS, REVIEW_FILTERS } from '@miguelfranken/ui/lib/review';
import { MAX_COMMENT_LENGTH } from '@miguelfranken/ui/lib/review-threads';
import { signCaptureImagePath } from '@/lib/auth/artifact-url';
import { baseUrl } from '@/lib/auth/config';
import { annotate, cropAround } from '@/lib/review/annotate';
import { pinSpecs, readCaptureBytes, threadComments, threadPosition } from '@/lib/review/images';
import { captureInProject, decide, MAX_DECISION_CAPTURES, ReviewError, runReview, type CaptureRecord, type ComparedCapture } from '@/lib/review/queries';
import { createThread, ThreadError, type CaptureThread } from '@/lib/review/threads';
import { artifactUrlTtlSeconds, inlineImageMaxBytes } from '../config';
import { invalid, notFound } from '../errors';
import { branchParam, commonParams, isUuid, runParam } from '../params';
import { defineTool, output } from '../registry';
import { link } from '../render/markdown';
import { resolveRun } from '../resolve';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;

/** Close-ups sent without being asked for: beyond this many open pins, only with `thread`. */
const AUTO_CROPS = 6;

// ---------------------------------------------------------------- threads, shared with review-threads.ts

const box = z.object({ x: z.number(), y: z.number(), w: z.number().nullable(), h: z.number().nullable() });

export const threadOut = z.object({
  number: z.number().describe('The number on the pin: how the image, the text and people refer to the thread.'),
  threadId: z.string(),
  status: z.enum(['open', 'resolved']),
  placement: z.enum(['exact', 'outdated']).describe('outdated: placed on an earlier run whose image has changed since, so the pin may be off.'),
  anchor: z.enum(['point', 'area', 'image']).describe('A spot, an area, or the whole image (no pin).'),
  pixels: box.nullable().describe('In this image’s pixels, from its top-left corner.'),
  percent: box.nullable().describe('In percent of the image’s width and height.'),
  css: box.nullable().describe('In the page’s CSS pixels (pixels ÷ device scale factor), when the scale is known.'),
  placedOnRun: z.number().nullable(),
  comments: z.array(z.object({ kind: z.string(), author: z.string().nullable(), via: z.string(), at: z.string(), body: z.string() })),
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
    placedOnRun: t.originRunNumber,
    comments: threadComments(t),
    url,
  };
}

/** A thread as a few lines of markdown: number, where, status, then the conversation. */
export function renderThread(md: { line(s: string): void }, t: z.infer<typeof threadOut>, position: string) {
  const flags = [t.status, t.placement === 'outdated' ? `outdated — placed on run #${t.placedOnRun ?? '?'}, the image changed since` : null].filter(Boolean).join(', ');
  md.line(`**#${t.number}** · ${position} · ${flags}`);
  for (const c of t.comments) {
    if (c.kind !== 'comment') md.line(`  - _${c.author ?? 'Someone'} ${c.kind === 'resolved' ? 'resolved it' : 'reopened it'}_`);
    else md.line(`  - ${c.author ?? 'Someone'}${c.via === 'mcp' ? ' (AI assistant)' : ''}: ${c.body.replace(/\s+/g, ' ')}`);
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

const captureOut = z.object({
  captureId: z.string(),
  variant: z.string(),
  status: z.string(),
  sameAsBaseline: z.boolean().nullable(),
  baselineRun: z.number().nullable(),
  comment: z.string().nullable(),
  openThreads: z.number().optional().describe('Open comment threads on the image: see them pinned with get_review_checkpoint.'),
});

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
    "A run's review checkpoints — the named screenshots its tests capture at their milestones, per variant (desktop, mobile) — in journey order, with each image's review status (changed against its approved baseline, new, approved or changes requested) and its open comment threads. Defaults to what needs review. Look at one with get_review_checkpoint.",
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
                  openThreads: c.threads.filter((t) => t.status === 'open').length,
                })),
            };
          })
          .filter((cp) => cp.captures.length > 0),
      }))
      .filter((t) => t.checkpoints.length > 0);
    const reviewUrlOfRun = `${project.links.run(run.number)}/review`;
    return {
      data: { project: project.ref, run: run.number, reviewUrl: reviewUrlOfRun, counts, tests },
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
            ['#', 'Checkpoint', 'Variant', 'Status', 'Open threads', 'Capture id'],
            t.checkpoints.flatMap((cp) => cp.captures.map((c) => [cp.order, cp.title, c.variant, c.status + (c.comment ? ` — "${c.comment}"` : ''), c.openThreads ?? 0, c.captureId])),
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
  pins: z.boolean().optional().describe('Draw the open comment threads on the image as numbered pins. Default true.'),
  thread: z.number().int().positive().optional().describe('Focus one thread by its number: its close-up is attached (and its pin drawn even if resolved).'),
  crops: z.boolean().optional().describe(`Attach a close-up around each pin. Default: when at most ${AUTO_CROPS} threads are open.`),
  includeResolved: z.boolean().optional().describe('Also list (and pin) resolved threads. Default false.'),
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
  note: z.string().nullable(),
  image: z
    .object({ width: z.number(), height: z.number(), attachedWidth: z.number().nullable(), attachedHeight: z.number().nullable() })
    .nullable()
    .optional()
    .describe('The image’s size in pixels, and the size it was attached at (scaled to be readable).'),
  annotatedImageUrl: z.string().nullable().optional().describe('A short-lived link to the image with its open threads drawn on it as numbered pins.'),
  reviewUrl: z.string().optional().describe('The checkpoint in the app’s viewer.'),
  threads: z.array(threadOut).optional().describe('Comment threads on the image, by the numbers on its pins.'),
  attachments: z.array(z.string()).optional().describe('What each attached image is, in order.'),
});

const asImage = (img: { data: Buffer; mimeType: string }): ImageContent => ({ type: 'image', data: img.data.toString('base64'), mimeType: img.mimeType });

/** A capture as an inline image, scaled and re-encoded to fit; with pins when there are any. `null` when it cannot be read. */
async function inlineCapture(capture: CaptureRecord, pins: Parameters<typeof annotate>[1]) {
  const source = await readCaptureBytes(capture);
  if (!source) return null;
  try {
    const out = await annotate(source.bytes, pins, { maxBytes: inlineImageMaxBytes() });
    return { image: asImage(out), out, bytes: source.bytes };
  } catch {
    // Not an image sharp can read (an SVG, a truncated file): as it is, when small enough.
    if (source.bytes.byteLength > inlineImageMaxBytes()) return null;
    return { image: { type: 'image', data: Buffer.from(source.bytes).toString('base64'), mimeType: source.contentType } as ImageContent, out: null, bytes: null };
  }
}

export const getReviewCheckpoint = defineTool({
  name: 'get_review_checkpoint',
  title: 'Get a review checkpoint',
  toolset: 'core',
  description:
    'One review checkpoint image, with its approved baseline (or the previous run’s capture) beside it, so you can say what changed. Open comment threads are drawn on the image as numbered pins, a close-up per pin follows, and the threads are listed by the same numbers — what each asks to change, and where. Large images are scaled to fit.',
  input: getInput,
  output: getOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { artifact: ['read'] });
    if (!isUuid(args.capture)) throw invalid('"capture" is a capture id, from list_review_checkpoints.');
    const found = await captureInProject(project.project.id, args.capture.toLowerCase());
    if (!found) throw notFound(`Capture ${args.capture} not found in ${project.ref}.`, 'Call list_review_checkpoints for the ids.');
    const { capture } = found;
    const reference = capture.baseline?.capture ?? null;
    const shownThreads = capture.threads.filter((t) => args.includeResolved || t.status === 'open' || t.number === args.thread);
    const focus = args.thread != null ? capture.threads.find((t) => t.number === args.thread) : undefined;
    if (args.thread != null && !focus) throw notFound(`This image has no thread #${args.thread}.`, 'The threads are listed without "thread".');
    const pins = args.pins === false ? [] : pinSpecs(shownThreads, true);

    const images: ImageContent[] = [];
    const described: string[] = [];
    const main = await inlineCapture(capture, pins);
    if (main) {
      images.push(main.image);
      described.push(pins.length ? 'this run’s image, with the open threads pinned' : 'this run’s image');
    }
    const compare = args.compare ?? true;
    const ref = compare && reference ? await inlineCapture(reference, []) : null;
    if (ref) {
      images.push(ref.image);
      described.push('the approved baseline');
    }
    const cropTargets = focus ? [focus] : args.crops === false || (args.crops !== true && shownThreads.filter((t) => t.status === 'open').length > AUTO_CROPS) ? [] : shownThreads;
    if (main?.bytes && args.pins !== false) {
      for (const t of cropTargets) {
        const spec = pins.find((p) => p.number === t.number);
        if (!spec) continue;
        const crop = await cropAround(main.bytes, spec, pins, { maxBytes: Math.max(64 * 1024, Math.floor(inlineImageMaxBytes() / 2)) }).catch(() => null);
        if (crop) {
          images.push(asImage(crop));
          described.push(`a close-up of #${t.number}`);
        }
      }
    }

    const notes = [
      !main ? 'The image is not available to attach; open the link.' : null,
      compare && reference && !ref ? 'The baseline is gone or cannot be attached.' : null,
      compare && !reference ? 'Nobody approved this checkpoint yet: there is no baseline.' : null,
    ].filter(Boolean);
    const threads = shownThreads.map((t) => toThreadOut(t, capture, reviewUrl(project.links, found.runNumber, capture, t.number)));
    const hidden = capture.threads.length - shownThreads.length;
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
      note: [...notes, hidden > 0 ? `${hidden} resolved thread${hidden === 1 ? '' : 's'} not shown (includeResolved).` : null].filter(Boolean).join(' ') || null,
      image: main?.out ? { width: main.out.source.width, height: main.out.source.height, attachedWidth: main.out.width, attachedHeight: main.out.height } : capture.width && capture.height ? { width: capture.width, height: capture.height, attachedWidth: null, attachedHeight: null } : null,
      annotatedImageUrl: capture.attachment.status === 'uploaded' ? `${baseUrl()}${signCaptureImagePath(capture.id, artifactUrlTtlSeconds())}` : null,
      reviewUrl: reviewUrl(project.links, found.runNumber, capture),
      threads,
      attachments: described,
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
          ['Image', d.image ? `${d.image.width}×${d.image.height} px${d.image.attachedWidth && d.image.attachedWidth !== d.image.width ? `, attached at ${d.image.attachedWidth}×${d.image.attachedHeight}` : ''}` : null],
          ['Compared with', d.reference ? `${d.reference}: ${d.sameAsReference ? 'identical' : 'different'}` : null],
          ['In the app', d.reviewUrl ?? null],
          ['Image link', d.imageUrl],
          ['With pins', threads.length ? (d.annotatedImageUrl ?? null) : null],
          ['Baseline', d.referenceUrl],
        ]);
        if (d.attachments?.length) md.line(`Attached, in order: ${d.attachments.map((a, i) => `${i + 1}. ${a}`).join('; ')}.`);
        if (d.threads?.length) {
          md.heading(`Comment threads (${d.threads.filter((t) => t.status === 'open').length} open) — the numbers are the pins on the image`, 3);
          for (const t of d.threads) renderThread(md, t, threadPosition(shownThreads.find((x) => x.number === t.number)!, capture).text);
          md.line('Reply or resolve with comment_on_review and resolve_review_thread, by capture and number.');
        } else md.line('No open comment threads on this image.');
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
      source: 'mcp',
    }).catch((error: unknown) => {
      if (error instanceof ReviewError) throw invalid(error.message);
      throw error;
    });
    const pinned: { number: number; url: string }[] = [];
    if (args.pins?.length) {
      const found = await captureInProject(project.project.id, ids[0]);
      for (const pin of args.pins) {
        const thread = await createThread({ projectId: project.project.id, captureId: ids[0], anchor: fromPercent(pin), body: pin.comment, author: { userId: project.user.id, source: 'mcp' } }).catch((error: unknown) => {
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
