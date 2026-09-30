/**
 * Comment threads on review images: pins placed on a capture, numbered per
 * image, carried into later runs while open (outdated where the pixels
 * changed), resolved and reopened, and the change requests written before
 * threads existed turned into threads by the migration.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { attachments, projects, reviewCaptures, reviewComments, reviewDecisions, reviewThreads } from '@/lib/db/schema';
import { dueWhere } from '@/lib/storage/retention';
import { decide, runReview } from '@/lib/review/queries';
import { createThread, deleteComment, editComment, replyToThread, setThreadStatus } from '@/lib/review/threads';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from './factories';
import { describe, expect, test, type Tenant } from './fixtures';

const KEY = 'tests/checkout.spec.ts::books a workshop';
const sha = (c: string) => c.repeat(64);

/** A run of KEY capturing `ready` (and, with `steps`, the checkpoints after it) on desktop. */
async function runWith(tenant: Tenant, hash: string, startedAt: Date, steps: string[] = []) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const names = ['ready', ...steps];
  const images = names.map((name) => attachmentRef({ name: `review:${name}:desktop` }));
  const checkpoints: Checkpoint[] = names.map((name, i) => ({
    name,
    sequence: i,
    stepPath: [],
    variants: [{ variant: 'desktop', attachmentId: images[i].id, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, width: 2560, height: 4000, sha256: i === 0 ? hash : sha(String(i)) }],
  }));
  await ingestEvents(
    tenant.tokenProject,
    run,
    eventBatch([testBegin({ seq: 0, testKey: KEY }), attemptEnd({ seq: 1, testKey: KEY, startedAt: startedAt.toISOString(), attachments: images, checkpoints })]),
  );
  const [flow] = await runReview({ id: run.id, startedAt });
  return { run, capture: flow.checkpoints[0].captures[0] };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

describe('threads', () => {
  test('pins numbered threads in the image’s pixels and shows them with the capture', async ({ tenant }) => {
    const { run, capture } = await runWith(tenant, sha('a'), minutesAgo(5));
    const author = { userId: tenant.adminUser.id, source: 'app' as const };
    const first = await createThread({ projectId: tenant.project.id, captureId: capture.id, anchor: { kind: 'point', x: 0.25, y: 0.5 }, body: '  Use the primary button  ', author });
    const second = await createThread({ projectId: tenant.project.id, captureId: capture.id, anchor: { kind: 'area', x: 0.1, y: 0.1, w: 0.5, h: 0.05 }, body: 'Price wraps', author });

    expect(first).toMatchObject({ number: 1, anchor: { kind: 'point', x: 640, y: 2000 }, origin: { width: 2560, height: 4000, scale: 2 } });
    expect(first.comments[0]).toMatchObject({ body: 'Use the primary button', authorName: tenant.adminUser.name, source: 'app' });
    expect(second).toMatchObject({ number: 2, anchor: { kind: 'area', x: 256, y: 400, w: 1280, h: 200 } });

    const [flow] = await runReview({ id: run.id, startedAt: minutesAgo(5) });
    const shown = flow.checkpoints[0].captures[0].threads;
    expect(shown.map((t) => [t.number, t.placement, t.position.x, t.position.y])).toEqual([
      [1, 'exact', 0.25, 0.5],
      [2, 'exact', 0.1, 0.1],
    ]);
  });

  test('takes pixel anchors from tools, and refuses pins outside the image', async ({ tenant }) => {
    const { capture } = await runWith(tenant, sha('a'), minutesAgo(5));
    const author = { userId: null, source: 'mcp' as const };
    const thread = await createThread({ projectId: tenant.project.id, captureId: capture.id, anchor: { kind: 'point', x: 1280, y: 100 }, pixels: true, body: 'Logo is blurry', author });
    expect(thread.anchor).toMatchObject({ x: 1280, y: 100 });
    expect(thread.comments[0].source).toBe('mcp');
    await expect(createThread({ projectId: tenant.project.id, captureId: capture.id, anchor: { kind: 'point', x: 9000, y: 100 }, pixels: true, body: 'x', author })).rejects.toThrow('inside the image');
    await expect(createThread({ projectId: tenant.project.id, captureId: capture.id, anchor: { kind: 'point', x: 0.5, y: 0.5 }, body: '   ', author })).rejects.toThrow('Write a comment');
    await expect(createThread({ projectId: randomUUID(), captureId: capture.id, anchor: { kind: 'image', x: 0, y: 0 }, body: 'x', author })).rejects.toThrow('not in this project');
  });

  test('carries open threads into later runs, outdated where the image changed; resolved ones stay where they were', async ({ tenant }) => {
    const author = { userId: tenant.adminUser.id, source: 'app' as const };
    const first = await runWith(tenant, sha('a'), minutesAgo(10));
    const open = await createThread({ projectId: tenant.project.id, captureId: first.capture.id, anchor: { kind: 'point', x: 0.5, y: 0.5 }, body: 'Still open', author });
    const done = await createThread({ projectId: tenant.project.id, captureId: first.capture.id, anchor: { kind: 'point', x: 0.2, y: 0.2 }, body: 'Fixed later', author });
    await setThreadStatus({ projectId: tenant.project.id, threadId: done.id, status: 'resolved', captureId: first.capture.id, body: 'Looks good now', author });

    const same = await runWith(tenant, sha('a'), minutesAgo(8));
    expect(same.capture.threads.map((t) => [t.number, t.status, t.placement])).toEqual([
      [1, 'open', 'exact'],
      [2, 'resolved', 'exact'],
    ]);

    const changed = await runWith(tenant, sha('b'), minutesAgo(6));
    expect(changed.capture.threads.map((t) => [t.number, t.status, t.placement])).toEqual([[1, 'open', 'outdated']]);

    // A run from before the thread was placed does not show it.
    const older = await runWith(tenant, sha('c'), minutesAgo(30));
    expect(older.capture.threads).toEqual([]);

    const [resolved] = (await runReview({ id: first.run.id, startedAt: minutesAgo(10) }))[0].checkpoints[0].captures[0].threads.filter((t) => t.id === done.id);
    expect(resolved.comments.map((c) => [c.kind, c.body])).toEqual([
      ['comment', 'Fixed later'],
      ['comment', 'Looks good now'],
      ['resolved', ''],
    ]);
    expect(resolved.resolvedBy).toBe(tenant.adminUser.name);

    await setThreadStatus({ projectId: tenant.project.id, threadId: done.id, status: 'open', author });
    const reopened = await runWith(tenant, sha('b'), minutesAgo(4));
    expect(reopened.capture.threads.map((t) => t.number)).toEqual([1, 2]);
    void open;
  });

  test('replies, edits by the author only, and deletes: the opening comment takes the thread', async ({ db, tenant }) => {
    const { capture } = await runWith(tenant, sha('a'), minutesAgo(5));
    const author = { userId: tenant.adminUser.id, source: 'app' as const };
    const thread = await createThread({ projectId: tenant.project.id, captureId: capture.id, anchor: { kind: 'image', x: 0, y: 0 }, body: 'Whole page feels cramped', author });
    const reply = await replyToThread({ projectId: tenant.project.id, threadId: thread.id, body: 'Agreed', author });
    await editComment({ projectId: tenant.project.id, commentId: reply.id, body: 'Agreed, 16px more', userId: tenant.adminUser.id });
    await expect(editComment({ projectId: tenant.project.id, commentId: reply.id, body: 'hijack', userId: randomUUID() })).rejects.toThrow('Only its author');
    const [edited] = await db.select().from(reviewComments).where(eq(reviewComments.id, reply.id));
    expect(edited.body).toBe('Agreed, 16px more');
    expect(edited.editedAt).not.toBeNull();

    await expect(deleteComment({ projectId: tenant.project.id, commentId: reply.id, userId: randomUUID(), moderate: false })).rejects.toThrow('Only its author');
    expect(await deleteComment({ projectId: tenant.project.id, commentId: reply.id, userId: tenant.adminUser.id, moderate: false })).toEqual({ deletedThread: false });
    expect(await deleteComment({ projectId: tenant.project.id, commentId: thread.comments[0].id, userId: randomUUID(), moderate: true })).toEqual({ deletedThread: true });
    expect(await db.select().from(reviewThreads)).toEqual([]);
  });

  test('a change request with a comment opens a thread; approving can resolve the open ones', async ({ db, tenant }) => {
    const { run, capture } = await runWith(tenant, sha('a'), minutesAgo(5));
    await decide({ projectId: tenant.project.id, captureIds: [capture.id], decision: 'changes_requested', comment: 'Button wraps', userId: tenant.adminUser.id });
    await createThread({ projectId: tenant.project.id, captureId: capture.id, anchor: { kind: 'point', x: 0.5, y: 0.5 }, body: 'Here', author: { userId: tenant.adminUser.id, source: 'app' } });
    const [flow] = await runReview({ id: run.id, startedAt: minutesAgo(5) });
    expect(flow.checkpoints[0].captures[0].threads.map((t) => [t.number, t.anchor.kind, t.status])).toEqual([
      [1, 'image', 'open'],
      [2, 'point', 'open'],
    ]);

    const res = await decide({ projectId: tenant.project.id, captureIds: [capture.id], decision: 'approved', userId: tenant.adminUser.id, resolveThreads: true });
    expect(res).toEqual({ decided: 1, resolvedThreads: 2 });
    const threads = await db.select().from(reviewThreads);
    expect(threads.every((t) => t.status === 'resolved' && t.resolvedCaptureId === capture.id)).toBe(true);
  });

  test('keeps numbers unique when reviewers pin at the same time', async ({ db, tenant }) => {
    const { capture } = await runWith(tenant, sha('a'), minutesAgo(5));
    const author = { userId: tenant.adminUser.id, source: 'app' as const };
    await Promise.all(Array.from({ length: 6 }, (_, i) => createThread({ projectId: tenant.project.id, captureId: capture.id, anchor: { kind: 'point', x: i / 10, y: 0.5 }, body: `#${i}`, author })));
    const numbers = (await db.select({ n: reviewThreads.number }).from(reviewThreads)).map((r) => r.n).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('retention', () => {
  const later = () => new Date(Date.now() + 2 * 86_400_000);
  const policy = { enabled: true, days: 1, overrides: {}, keepVisuals: true };

  test('keeps every image of a flow with an open thread, until it is resolved', async ({ db, tenant }) => {
    // Off the library: the default branch's newest screens are kept for being in it.
    await db.update(projects).set({ settings: { defaultBranch: 'release' } }).where(eq(projects.id, tenant.project.id));
    const { run, capture } = await runWith(tenant, sha('a'), minutesAgo(5), ['paid', 'confirmed']);
    const other = await runWith(tenant, sha('a'), minutesAgo(4), ['paid']);
    await db.update(attachments).set({ status: 'uploaded' });
    const flow = (await db.select({ id: reviewCaptures.attachmentId }).from(reviewCaptures).where(eq(reviewCaptures.runId, run.id))).map((c) => c.id);
    const elsewhere = (await db.select({ id: reviewCaptures.attachmentId }).from(reviewCaptures).where(eq(reviewCaptures.runId, other.run.id))).map((c) => c.id);
    expect(flow).toHaveLength(3);
    const due = async (p = policy) => (await db.select({ id: attachments.id }).from(attachments).where(dueWhere(p, later()))).map((d) => d.id);

    // A thread on the first image keeps the whole flow of that run, not the other run's.
    const thread = await createThread({ projectId: tenant.project.id, captureId: capture.id, anchor: { kind: 'point', x: 0.5, y: 0.5 }, body: 'Here', author: { userId: null, source: 'app' } });
    const kept = await due();
    for (const id of flow) expect(kept).not.toContain(id);
    for (const id of elsewhere) expect(kept).toContain(id);

    // Unless the policy lets visuals expire.
    const expiring = await due({ ...policy, keepVisuals: false });
    for (const id of flow) expect(expiring).toContain(id);

    // Resolved, it ages out like any other.
    await setThreadStatus({ projectId: tenant.project.id, threadId: thread.id, status: 'resolved', author: { userId: null, source: 'app' } });
    const resolved = await due();
    for (const id of flow) expect(resolved).toContain(id);
  });
});

describe('migration', () => {
  test('turns earlier change requests into whole-image threads, resolved by a later approval', async ({ db, tenant }) => {
    const { capture } = await runWith(tenant, sha('a'), minutesAgo(5));
    const [c] = await db.select().from(reviewCaptures).where(eq(reviewCaptures.id, capture.id));
    const base = { projectId: tenant.project.id, testId: c.testId, checkpointName: c.checkpointName, variant: c.variant, sha256: c.sha256, captureId: c.id, runId: c.runId, userId: tenant.adminUser.id };
    await db.insert(reviewDecisions).values([
      { ...base, id: randomUUID(), decision: 'changes_requested', comment: 'Button wraps', createdAt: minutesAgo(4) },
      // The same comment again (a decision about several captures copies it): one thread.
      { ...base, id: randomUUID(), decision: 'changes_requested', comment: 'Button wraps', createdAt: minutesAgo(3) },
      { ...base, id: randomUUID(), decision: 'changes_requested', comment: 'Spacing', createdAt: minutesAgo(2) },
      { ...base, id: randomUUID(), decision: 'changes_requested', comment: null, createdAt: minutesAgo(2) },
      { ...base, id: randomUUID(), decision: 'approved', comment: null, createdAt: minutesAgo(1) },
    ]);
    const migration = await readFile(path.join(import.meta.dirname, '../../lib/db/migrations/0016_review_threads.sql'), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint').slice(-2)) await db.execute(sql.raw(statement));

    const threads = await db.select().from(reviewThreads).orderBy(reviewThreads.number);
    expect(threads.map((t) => [t.number, t.anchor, t.status])).toEqual([
      [1, 'image', 'resolved'],
      [2, 'image', 'resolved'],
    ]);
    const comments = await db.select().from(reviewComments);
    expect(comments.map((x) => x.body).sort()).toEqual(['Button wraps', 'Spacing']);
  });
});
