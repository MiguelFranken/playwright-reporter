/**
 * The work list of visual feedback: every open request for a change — pinned
 * comment threads and change requests without a comment — one record each,
 * with the exact test that produces the image, the checkpoint key, the image
 * as it is now and the one the request was made on. What an assistant needs
 * to fix a product from its screenshots, and to account for every request at
 * the end, in one paged call instead of joining three.
 */
import { z } from 'zod';
import { defaultLibraryRef, getLibraryReference, libraryFlows } from '@/lib/review/library';
import { libraryRefParam, type LibraryRefKey } from '@miguelfranken/ui/lib/library';
import { defaultBranch } from '@/lib/db/queries/mcp';
import { feedbackRequests, producingTests, type FeedbackRequest } from '@/lib/review/feedback-requests';
import { threadComments, threadPosition } from '@/lib/review/images';
import { capturesById, runReview, type ComparedCapture } from '@/lib/review/queries';
import { invalid } from '../errors';
import { branchParam, commonParams, cursorParam, runParam } from '../params';
import { defineTool, output } from '../registry';
import { link } from '../render/markdown';
import { resolveRun } from '../resolve';
import { agentOut, commentBy, reviewUrl } from './review';

const MAX_LIMIT = 200;

const input = z.object({
  ...commonParams,
  branch: branchParam.describe('The library reference: a branch, e.g. "feature/workshop-sessions". Pass the branch the work is on — do not rely on a default.'),
  pullRequest: z.number().int().positive().optional().describe('The library reference: a pull (merge) request number, instead of a branch.'),
  run: runParam.optional().describe('One run instead of the library (only its own captures: a partial run leaves screens out).'),
  stage: z.enum(['all', 'waiting', 'verify']).optional().describe('waiting: the image is still the one the request was made on. verify: it changed since — check it. Default all.'),
  test: z.string().optional().describe('Part of a test title or file, to narrow the list.'),
  variant: z.string().optional().describe('Only this variant, e.g. "desktop" or "mobile".'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Requests per page (1–${MAX_LIMIT}, default 50).`),
  cursor: cursorParam,
});

const box = z.object({ x: z.number(), y: z.number(), w: z.number().nullable(), h: z.number().nullable() });

const requestOut = z.object({
  requestId: z.string().describe('Stable across runs: "thread:<id>" or "capture:<decision id>". Keep it in your work list; a request is done when a person resolves or approves it.'),
  kind: z.enum(['thread', 'capture']).describe('thread: a comment thread (a pin, an area, or the whole image). capture: "changes requested" on the image without a comment — look at the image to see what.'),
  stage: z.enum(['waiting', 'verify']),
  thread: z.number().nullable().describe('The number on the pin (threads).'),
  threadId: z.string().nullable(),
  test: z.object({
    testId: z.string(),
    title: z.string().describe('The full title path, joined with " › ".'),
    titlePath: z.array(z.string()),
    file: z.string(),
    line: z.number().describe('Where the reported run found it: a clue in a changed checkout, not an exact selector.'),
    browser: z.string().describe('The Playwright project it ran in.'),
  }),
  checkpoint: z.object({ key: z.string().describe('The checkpoint name the test passes to its capture helper: search the spec for it.'), title: z.string(), order: z.number() }),
  variant: z.string(),
  current: z.object({ captureId: z.string(), run: z.number(), status: z.string(), url: z.string() }),
  original: z
    .object({ captureId: z.string(), run: z.number().nullable(), url: z.string().nullable() })
    .nullable()
    .describe('The image the request was made on, when the current one is newer: compare the two with get_review_checkpoint against "origin".'),
  percent: box.nullable().describe('Where the pin points on the current image, in percent (threads with a pin).'),
  position: z.string().nullable().describe('The pin’s position in words, pixels and CSS pixels.'),
  conversation: z.array(z.object({ kind: z.string(), author: z.string().nullable(), agent: agentOut, via: z.string(), at: z.string(), body: z.string() })).describe('The whole thread, oldest first.'),
  requestedBy: z.string().nullable().optional().describe('Who asked for changes (capture requests).'),
  requestedAt: z.string().nullable().optional(),
});

const outputSchema = output({
  project: z.string(),
  scope: z.string().describe('What was searched: "library branch:main", "library pr:212" or "run #128".'),
  pinnedRun: z.number().nullable().optional().describe('The library reference is pinned to this run: newer runs of it are not shown.'),
  latestRun: z.number().nullable().optional(),
  counts: z.object({
    total: z.number().describe('Every open request in the scope and filters, across all pages.'),
    threads: z.number(),
    captureRequests: z.number().describe('Change requests without a comment (no thread).'),
    waiting: z.number(),
    verify: z.number(),
    returned: z.number(),
  }),
  requests: z.array(requestOut),
  producers: z
    .array(z.object({ testId: z.string(), title: z.string(), titlePath: z.array(z.string()), file: z.string(), line: z.number(), browser: z.string(), requests: z.number(), checkpoints: z.array(z.string()) }))
    .describe('The distinct tests that produce every request in the scope (all pages): the set a narrow re-run selects — no more.'),
  nextCursor: z.string().nullable(),
  notes: z.array(z.string()).optional().describe('What the scope leaves out, or assumed.'),
});

const encodeCursor = (offset: number) => Buffer.from(`fr:${offset}`).toString('base64url');
function decodeCursor(cursor: string | undefined) {
  if (!cursor) return 0;
  const m = /^fr:(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString());
  if (!m) throw invalid('"cursor" is the nextCursor of a previous list_feedback_requests answer.');
  return Number(m[1]);
}

export const listFeedbackRequests = defineTool({
  name: 'list_feedback_requests',
  title: 'List open visual feedback requests',
  toolset: 'core',
  description:
    'Start here to fix a product from visual feedback: every open request for a change on its screenshots — comment threads and "changes requested" without a comment — one record each, with the producing test (id, full title, file, browser), the checkpoint key, the image now and the one the request was made on, the whole conversation, and whether it waits for a fix or changed since (verify). Library scope by default, so screens a partial run skipped are included. Paged; counts cover all pages.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    if (args.branch && args.pullRequest) throw invalid('Pass "branch" or "pullRequest", not both.');
    if (args.run && (args.branch || args.pullRequest)) throw invalid('Pass a library reference (branch or pullRequest) or a run, not both.');
    let flows;
    let scope: string;
    let reference: LibraryRefKey | null = null;
    let pinnedRun: number | null = null;
    let latestRun: number | null = null;
    const notes: string[] = [];
    if (args.run) {
      const run = await resolveRun(project, args.run);
      flows = await runReview({ id: run.id, startedAt: run.startedAt });
      scope = `run #${run.number}`;
      notes.push('One run only: screens it did not capture are not listed. Leave "run" out for the library.');
    } else {
      const branch = await defaultBranch(project.project.id, project.project.settings);
      reference = args.pullRequest ? { kind: 'pull_request', prNumber: args.pullRequest } : args.branch ? { kind: 'branch', branch: args.branch } : await defaultLibraryRef(project.project.id, branch);
      if (!args.branch && !args.pullRequest) notes.push(`No branch given: the library’s default reference, ${libraryRefParam(reference)}. Pass the branch you are working on.`);
      const [view, found] = await Promise.all([getLibraryReference(project.project.id, reference, branch).catch(() => null), libraryFlows(project.project.id, reference)]);
      flows = found;
      pinnedRun = view?.pinnedRun?.number ?? null;
      latestRun = view?.latestRun?.number ?? null;
      if (pinnedRun && latestRun && latestRun !== pinnedRun) notes.push(`The reference is pinned to run #${pinnedRun}; run #${latestRun} is newer and not shown.`);
      scope = `library ${libraryRefParam(reference)}`;
    }
    const q = args.test?.toLowerCase();
    const all = feedbackRequests(flows).filter(
      (r) =>
        (!q || r.test.title.toLowerCase().includes(q) || r.test.file.toLowerCase().includes(q)) &&
        (!args.variant || r.variant === args.variant) &&
        (!args.stage || args.stage === 'all' || r.stage === args.stage),
    );
    const offset = decodeCursor(args.cursor);
    const limit = args.limit ?? 50;
    const page = all.slice(offset, offset + limit);
    const nextCursor = offset + limit < all.length ? encodeCursor(offset + limit) : null;

    // The originals of change requests without a comment: their checkpoint, for a link.
    const decisionOrigins = await capturesById([...new Set(page.filter((r) => r.kind === 'capture' && r.original).map((r) => r.original!.captureId))]);
    const originCheckpoint = new Map(decisionOrigins.map((c) => [c.id, c.checkpointId]));
    const captureOf = new Map<string, ComparedCapture>();
    for (const f of flows) for (const cp of f.checkpoints) for (const c of cp.captures) captureOf.set(c.id, c);
    const url = (r: FeedbackRequest, captureId: string, checkpointId: string, run: number, thread: number | null) =>
      reference && captureId === r.current.captureId
        ? libraryUrl(project.links.library(reference), { checkpointId, variant: r.variant }, thread)
        : reviewUrl(project.links, run, { checkpointId, variant: r.variant }, thread);

    const requests = page.map((r) => {
      const t = r.thread;
      const capture = captureOf.get(r.current.captureId)!;
      const pos = t ? threadPosition(t, capture) : null;
      const originCp = t ? (t.originImage?.checkpointId ?? null) : r.original ? (originCheckpoint.get(r.original.captureId) ?? null) : null;
      return {
        requestId: r.requestId,
        kind: r.kind,
        stage: r.stage,
        thread: t?.number ?? null,
        threadId: t?.id ?? null,
        test: r.test,
        checkpoint: r.checkpoint,
        variant: r.variant,
        current: { captureId: r.current.captureId, run: r.current.run, status: r.current.status, url: url(r, r.current.captureId, r.current.checkpointId, r.current.run, t?.number ?? null) },
        original: r.original ? { captureId: r.original.captureId, run: r.original.run, url: originCp && r.original.run ? url(r, r.original.captureId, originCp, r.original.run, t?.number ?? null) : null } : null,
        percent: pos?.percent ?? null,
        position: pos ? pos.text : null,
        conversation: t ? threadComments(t) : [],
        ...(r.decision ? { requestedBy: r.decision.by, requestedAt: r.decision.at.toISOString() } : {}),
      };
    });
    const counts = {
      total: all.length,
      threads: all.filter((r) => r.kind === 'thread').length,
      captureRequests: all.filter((r) => r.kind === 'capture').length,
      waiting: all.filter((r) => r.stage === 'waiting').length,
      verify: all.filter((r) => r.stage === 'verify').length,
      returned: requests.length,
    };
    return {
      data: { project: project.ref, scope, pinnedRun, latestRun, counts, requests, producers: producingTests(all), nextCursor, notes },
      render(md, d) {
        md.heading(`Open visual feedback — ${d.scope}`, 2);
        md.line(
          `${d.counts.total} open request${d.counts.total === 1 ? '' : 's'}: ${d.counts.threads} comment thread${d.counts.threads === 1 ? '' : 's'}, ${d.counts.captureRequests} change request${d.counts.captureRequests === 1 ? '' : 's'} without a comment; ${d.counts.waiting} waiting for a fix, ${d.counts.verify} changed since (verify). Showing ${d.counts.returned}${d.nextCursor ? ' — more with nextCursor' : ''}.`,
        );
        for (const n of d.notes ?? []) md.line(`Note: ${n}`);
        if (!d.requests.length) {
          md.line('Nothing is waiting for a change.');
          return;
        }
        let lastTest = '';
        for (const r of d.requests) {
          if (r.test.testId !== lastTest) {
            md.heading(`${r.test.title} — ${r.test.file}:${r.test.line} [${r.test.browser}]`, 3);
            lastTest = r.test.testId;
          }
          const what = r.kind === 'thread' ? `#${r.thread}` : 'changes requested (no comment)';
          const orig = r.original ? `; made on run #${r.original.run ?? '?'} (capture ${r.original.captureId})` : '';
          md.line(`- **${r.checkpoint.title}** (\`${r.checkpoint.key}\`, ${r.variant}) ${what} · ${r.stage === 'verify' ? 'changed since — verify' : 'waiting for a fix'} · now: run #${r.current.run}, capture ${r.current.captureId}${orig} · ${link('open', r.current.url)}`);
          if (r.position) md.line(`  - at ${r.position}`);
          for (const c of r.conversation) if (c.kind === 'comment') md.line(`  - ${commentBy(c)}: ${c.body.replace(/\s+/g, ' ')}`);
          if (r.kind === 'capture') md.line(`  - ${r.requestedBy ?? 'Someone'} asked for changes without saying what: look at the image${r.original ? ' as it was' : ''} with get_review_checkpoint.`);
        }
        md.heading('Producing tests (every page)', 3);
        md.table(['Test', 'File', 'Browser', 'Requests', 'Checkpoints'], d.producers.map((p) => [p.title, `${p.file}:${p.line}`, p.browser, p.requests, p.checkpoints.join(', ')]));
        md.line(
          'Next: get_review_checkpoint with a capture (and thread; against "origin" for a request that changed since) to look; fix the rendering code; re-run only the producing tests and preview the selection with --list first; then compare each new image with the one the request was made on. A passed test or a changed image is not an approval: leave resolving and approving to a person, and reply on threads only when the user asked you to.',
        );
      },
    };
  },
});

/** Where the library opens a capture's checkpoint, and one of its threads. */
function libraryUrl(base: string, capture: { checkpointId: string; variant: string }, thread: number | null) {
  const url = new URL(base);
  url.searchParams.set('cp', capture.checkpointId);
  url.searchParams.set('v', capture.variant);
  if (thread) url.searchParams.set('thread', String(thread));
  return url.toString();
}

export const FEEDBACK_TOOLS = [listFeedbackRequests];
