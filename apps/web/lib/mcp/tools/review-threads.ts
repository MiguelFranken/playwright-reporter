/**
 * Comment threads on review images, for assistants: the change requests of a
 * run (or of one image) by number, where each points, and the conversation —
 * and, with a write-scoped token, pinning a new one, replying and resolving.
 *
 * Threads are addressed the way people see them: an image (its capture id)
 * and the number on the pin. Positions go in and come out in percent of the
 * image, which survives any scaling of the image a model was shown.
 */
import { z } from 'zod';
import { checkpointLabel } from '@miguelfranken/ui/lib/review';
import { libraryRefParam, type LibraryRefKey } from '@miguelfranken/ui/lib/library';
import { MAX_COMMENT_LENGTH, THREAD_FILTERS } from '@miguelfranken/ui/lib/review-threads';
import { defaultBranch } from '@/lib/db/queries/mcp';
import { threadPosition } from '@/lib/review/images';
import { defaultLibraryRef, libraryFlows } from '@/lib/review/library';
import { captureInProject, runReview, type ComparedCapture, type ReviewFlowRecord } from '@/lib/review/queries';
import { createThread, replyToThread, setThreadStatus, ThreadError } from '@/lib/review/threads';
import { invalid, notFound } from '../errors';
import { branchParam, commonParams, isUuid, runParam } from '../params';
import { defineTool, output } from '../registry';
import { link } from '../render/markdown';
import { resolveRun } from '../resolve';
import { fromPercent, percentAnchor, renderThread, reviewUrl, threadOut, toThreadOut } from './review';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;

const captureParam = z.string().describe('Capture id: one image, from list_review_checkpoints or list_review_threads.');
const threadNumber = z.number().int().positive().describe('The thread’s number: the one on its pin.');

async function captureOf(projectId: string, projectRef: string, id: string) {
  if (!isUuid(id)) throw invalid('"capture" is a capture id, from list_review_checkpoints.');
  const found = await captureInProject(projectId, id.toLowerCase());
  if (!found) throw notFound(`Capture ${id} not found in ${projectRef}.`, 'Call list_review_checkpoints for the ids.');
  return found;
}

const asInvalid = (error: unknown): never => {
  if (error instanceof ThreadError) throw invalid(error.message);
  throw error;
};

// ---------------------------------------------------------------- list_review_threads

const listInput = z.object({
  ...commonParams,
  run: runParam.optional().describe('The run (default "latest"). Scope "latest" with branch. Ignored with capture or library.'),
  branch: branchParam,
  library: z
    .boolean()
    .optional()
    .describe(
      'The library’s screens instead of one run: every screen of branch (or pullRequest; default: the library’s default reference) as its newest run captured it, so feedback on screens a partial run skipped is included.',
    ),
  pullRequest: z.number().int().positive().optional().describe('With library: a pull (merge) request number instead of a branch.'),
  capture: captureParam.optional().describe('Only this image’s threads.'),
  status: z.enum(THREAD_FILTERS).optional().describe('open (default), resolved or all.'),
  placement: z
    .enum(['exact', 'outdated'])
    .optional()
    .describe('exact: on the image as it is now (waiting for changes). outdated: placed on an earlier version that has changed since (ready to verify, then resolve).'),
  test: z.string().optional().describe('Part of a test title or file, to narrow the list.'),
});

/** Where the library opens a capture's checkpoint, and one of its threads. */
function libraryUrl(base: string, capture: Pick<ComparedCapture, 'checkpointId' | 'variant'>, thread: number | null) {
  const url = new URL(base);
  url.searchParams.set('cp', capture.checkpointId);
  url.searchParams.set('v', capture.variant);
  if (thread) url.searchParams.set('thread', String(thread));
  return url.toString();
}

const listOutput = output({
  project: z.string(),
  run: z.number().describe('The run shown; in the library, the newest run the screens come from.'),
  reference: z.string().nullable().optional().describe('With library: "branch:main" or "pr:212".'),
  counts: z.object({ open: z.number(), resolved: z.number(), outdated: z.number().optional().describe('Open threads placed on an earlier version of their image.') }),
  images: z.array(
    z.object({
      captureId: z.string(),
      test: z.string(),
      checkpoint: z.string(),
      variant: z.string(),
      imageStatus: z.string(),
      run: z.number().optional().describe('The run the image was captured in.'),
      threads: z.array(threadOut),
    }),
  ),
});

export const listReviewThreads = defineTool({
  name: 'list_review_threads',
  title: 'List review comment threads',
  toolset: 'core',
  description:
    'The comment threads people (or assistants) pinned on a run’s review images — change requests at a spot or an area of a screenshot — per image, by the number on the pin, with where each points (pixels, percent, CSS pixels) and the conversation. Open ones by default. With library, every screen of a branch or pull request as the library shows it, so feedback on screens a partial run skipped is included; placement "outdated" lists the feedback whose image changed since (ready to verify), "exact" what still waits for a change. See one pinned on its image with get_review_checkpoint and thread.',
  input: listInput,
  output: listOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    const filter = args.status ?? 'open';
    const keep = (s: string) => filter === 'all' || s === filter;
    let runNumber: number;
    let reference: LibraryRefKey | null = null;
    let entries: { capture: ComparedCapture; test: string; checkpoint: string; runNumber: number }[];
    const q = args.test?.toLowerCase();
    const flowEntries = (flows: readonly ReviewFlowRecord[]) =>
      flows
        .filter((f) => !q || f.titlePath.join(' ').toLowerCase().includes(q) || f.file.toLowerCase().includes(q))
        .flatMap((f) =>
          f.checkpoints.flatMap((cp) =>
            cp.captures.map((capture) => ({ capture, test: f.titlePath.join(' › ') || f.title, checkpoint: checkpointLabel(cp.name, cp.title), runNumber: capture.runNumber ?? f.origins?.[cp.testResultId]?.runNumber ?? f.runNumber })),
          ),
        );
    if (args.capture) {
      const found = await captureOf(project.project.id, project.ref, args.capture);
      runNumber = found.runNumber;
      entries = [{ capture: found.capture, test: found.testTitle, checkpoint: checkpointLabel(found.capture.checkpointName, found.checkpointTitle), runNumber: found.runNumber }];
    } else if (args.library || args.pullRequest) {
      if (args.branch && args.pullRequest) throw invalid('Pass "branch" or "pullRequest", not both.');
      reference = args.pullRequest
        ? { kind: 'pull_request', prNumber: args.pullRequest }
        : args.branch
          ? { kind: 'branch', branch: args.branch }
          : await defaultLibraryRef(project.project.id, await defaultBranch(project.project.id, project.project.settings));
      const flows = await libraryFlows(project.project.id, reference);
      entries = flowEntries(flows);
      runNumber = Math.max(0, ...entries.map((e) => e.runNumber));
    } else {
      const run = await resolveRun(project, args.run, { branch: args.branch });
      runNumber = run.number;
      entries = flowEntries(await runReview({ id: run.id, startedAt: run.startedAt }));
    }
    const counts = { open: 0, resolved: 0, outdated: 0 };
    const shows = (t: { status: string; placement: string }) => keep(t.status) && (!args.placement || t.placement === args.placement);
    const where = (capture: ComparedCapture, n: number | null, run: number) =>
      reference ? libraryUrl(project.links.library(reference), capture, n) : reviewUrl(project.links, run, capture, n);
    const images = entries
      .map(({ capture, test, checkpoint, runNumber: run }) => {
        for (const t of capture.threads) {
          counts[t.status]++;
          if (t.status === 'open' && t.placement === 'outdated') counts.outdated++;
        }
        return {
          captureId: capture.id,
          test,
          checkpoint,
          variant: capture.variant,
          imageStatus: capture.status,
          run,
          threads: capture.threads.filter(shows).map((t) => toThreadOut(t, capture, where(capture, t.number, run))),
          positions: new Map(capture.threads.map((t) => [t.number, threadPosition(t, capture).text])),
        };
      })
      .filter((i) => i.threads.length > 0);
    return {
      data: { project: project.ref, run: runNumber, reference: reference ? libraryRefParam(reference) : null, counts, images: images.map(({ positions: _, ...rest }) => rest) },
      render(md, d) {
        md.heading(d.reference ? `Comment threads in the library: ${d.reference}` : `Comment threads of run #${d.run}`, 2);
        md.line(`${d.counts.open} open (${d.counts.outdated ?? 0} on an earlier version of their image), ${d.counts.resolved} resolved.`);
        if (!d.images.length) {
          md.line(filter === 'open' ? 'No open threads: nothing asks for a change.' : 'No threads match.');
          return;
        }
        for (const [i, img] of d.images.entries()) {
          md.heading(`${img.checkpoint} — ${img.variant} (${img.test})`, 3);
          md.line(`Capture ${img.captureId} · run #${img.run} · image ${img.imageStatus} · ${link('open in the app', img.threads[0].url.replace(/&thread=\d+$/, ''))}`);
          for (const t of img.threads) renderThread(md, t, images[i].positions.get(t.number) ?? '');
        }
        md.line('To see the pins on the image: get_review_checkpoint with the capture (and thread for one close-up).');
      },
    };
  },
});

// ---------------------------------------------------------------- comment_on_review

const commentInput = z.object({
  ...commonParams,
  capture: captureParam,
  body: z.string().min(1).max(MAX_COMMENT_LENGTH).describe('The comment: what should change, or the answer to the thread.'),
  thread: threadNumber.optional().describe('Reply to this thread, by the number on its pin. Without it, a new thread.'),
  at: percentAnchor.optional().describe('Where a new thread points, in percent of the image: a spot, or an area with w and h. Without it, the whole image.'),
});

const commentOutput = output({
  project: z.string(),
  captureId: z.string(),
  action: z.enum(['created', 'replied']),
  thread: z.number(),
  threadId: z.string(),
  url: z.string(),
});

export const commentOnReview = defineTool({
  name: 'comment_on_review',
  title: 'Comment on a review image',
  toolset: 'write',
  description:
    'Pin a comment thread on a review image — at a spot or an area (in percent of the image), or about the whole image — or reply to a thread by its number. Say what should change and where, as a reviewer would; after fixing one, reply with what you did. Shown to people in the review viewer.',
  input: commentInput,
  output: commentOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { review: ['comment'] });
    const found = await captureOf(project.project.id, project.ref, args.capture);
    const author = { userId: project.user.id, source: 'mcp' as const };
    let number: number;
    let threadId: string;
    let action: 'created' | 'replied';
    if (args.thread != null) {
      if (args.at) throw invalid('"at" places a new thread; a reply goes to the thread’s place.');
      const target = found.capture.threads.find((t) => t.number === args.thread);
      if (!target) throw notFound(`This image has no thread #${args.thread}.`, 'list_review_threads with the capture lists them.');
      await replyToThread({ projectId: project.project.id, threadId: target.id, body: args.body, author }).catch(asInvalid);
      [number, threadId, action] = [target.number, target.id, 'replied'];
    } else {
      const thread = await createThread({ projectId: project.project.id, captureId: found.capture.id, anchor: args.at ? fromPercent(args.at) : { kind: 'image', x: 0, y: 0 }, body: args.body, author }).catch(asInvalid);
      [number, threadId, action] = [thread.number, thread.id, 'created'];
    }
    const url = reviewUrl(project.links, found.runNumber, found.capture, number);
    return {
      data: { project: project.ref, captureId: found.capture.id, action, thread: number, threadId, url },
      render(md, d) {
        md.line(`${d.action === 'created' ? 'Pinned thread' : 'Replied to thread'} #${d.thread}. ${link('See it in the app', d.url)}`);
      },
    };
  },
});

// ---------------------------------------------------------------- resolve_review_thread

const resolveInput = z.object({
  ...commonParams,
  capture: captureParam,
  thread: threadNumber,
  status: z.enum(['resolved', 'open']).optional().describe('resolved (default), or open to reopen it.'),
  comment: z.string().max(MAX_COMMENT_LENGTH).optional().describe('A closing note: what was done, or why it is reopened.'),
});

const resolveOutput = output({ project: z.string(), thread: z.number(), status: z.string(), changed: z.boolean(), url: z.string() });

export const resolveReviewThread = defineTool({
  name: 'resolve_review_thread',
  title: 'Resolve or reopen a review comment thread',
  toolset: 'write',
  description:
    'Mark a comment thread on a review image resolved — or open again — by the image and the number on its pin, with an optional closing note. Resolve only what is done; when the user asked you to fix a thread, prefer replying with what you did and let the reviewer resolve it.',
  input: resolveInput,
  output: resolveOutput,
  annotations: { ...WRITE, idempotentHint: true },
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { review: ['comment'] });
    const found = await captureOf(project.project.id, project.ref, args.capture);
    const target = found.capture.threads.find((t) => t.number === args.thread);
    if (!target) throw notFound(`This image has no thread #${args.thread}.`, 'list_review_threads with the capture lists them.');
    const status = args.status ?? 'resolved';
    const { changed } = await setThreadStatus({
      projectId: project.project.id,
      threadId: target.id,
      status,
      captureId: found.capture.id,
      body: args.comment,
      author: { userId: project.user.id, source: 'mcp' },
    }).catch(asInvalid);
    const url = reviewUrl(project.links, found.runNumber, found.capture, target.number);
    return {
      data: { project: project.ref, thread: target.number, status, changed, url },
      render(md, d) {
        md.line(d.changed ? `Thread #${d.thread} ${d.status === 'resolved' ? 'resolved' : 'reopened'}.` : `Thread #${d.thread} was already ${d.status}.`);
      },
    };
  },
});

export const REVIEW_THREAD_TOOLS = [listReviewThreads, commentOnReview, resolveReviewThread];
