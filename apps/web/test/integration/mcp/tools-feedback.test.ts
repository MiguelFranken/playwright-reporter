/**
 * Fixing a product from its visual feedback, the way an assistant does it:
 * one work list with every open request — pinned threads and a change request
 * without a comment, including a screen the newest (partial) run skipped —
 * then each request compared with the image it was made on, within an image
 * budget.
 */
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { attachments } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from '../factories';
import { describe, expect, test, type Db, type Tenant } from '../fixtures';
import { call, createPat, mcpClient } from './client';

const BRANCH = 'feature/workshop-sessions';

type Shot = { name: string; title: string; colour: string; test: 'coupon' | 'refund' };
const TESTS = {
  coupon: { key: 'tests/coupon.spec.ts::buys a coupon', title: 'buys a coupon', file: 'tests/coupon.spec.ts' },
  refund: { key: 'tests/refund.spec.ts::sends a refund email', title: 'sends a refund email', file: 'tests/refund.spec.ts' },
};

/** A run on the branch of the tests that captured `shots` (a partial run runs fewer tests), `minutes` after the first. */
async function run(tenant: Tenant, db: Db, minutes: number, shots: Shot[]) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: new Date(Date.UTC(2026, 8, 30, 10, minutes)).toISOString(), git: { branch: BRANCH, sha: 'f'.repeat(40), shortSha: 'fffffff' } }));
  const r = await getRunForProject(tenant.tokenProject, started.runId);
  const refs = shots.map((s) => attachmentRef({ name: `review:${s.name}:desktop` }));
  let seq = 0;
  const events = (['coupon', 'refund'] as const).flatMap((which) => {
    const mine = shots.map((s, i) => ({ s, i })).filter(({ s }) => s.test === which);
    if (!mine.length) return [];
    const t = TESTS[which];
    const checkpoints: Checkpoint[] = mine.map(({ s, i }, n) => ({
      name: s.name,
      title: s.title,
      sequence: n,
      variants: [{ variant: 'desktop', attachmentId: refs[i].id, sha256: s.colour.replace('#', '').padEnd(64, '0'), viewport: { width: 640, height: 1600 }, deviceScaleFactor: 2, width: 1280, height: 3200 }],
    }));
    return [testBegin({ seq: seq++, testKey: t.key, title: t.title, file: t.file }), attemptEnd({ seq: seq++, testKey: t.key, attachments: mine.map(({ i }) => refs[i]), checkpoints })];
  });
  await ingestEvents(tenant.tokenProject, r, eventBatch(events));
  for (const [i, s] of shots.entries()) {
    const png = await sharp({ create: { width: 1280, height: 3200, channels: 3, background: s.colour } }).png().toBuffer();
    const [row] = await db.select().from(attachments).where(eq(attachments.id, refs[i].id));
    await getStorage().put(row.storageKey, new Uint8Array(png), { contentType: 'image/png' });
    await db.update(attachments).set({ status: 'uploaded', sizeBytes: png.byteLength }).where(eq(attachments.id, refs[i].id));
  }
  return started.runNumber;
}

type Request = { requestId: string; kind: string; stage: string; thread: number | null; checkpoint: { key: string }; current: { captureId: string; run: number }; original: { captureId: string; run: number | null } | null; conversation: { body: string }[] };

const captureIn = async (client: Awaited<ReturnType<typeof mcpClient>>, project: string, runNumber: number, name: string) => {
  const listed = await call(client, 'list_review_checkpoints', { project, run: runNumber, status: 'all' });
  const tests = listed.structuredContent!.tests as { checkpoints: { name: string; captures: { captureId: string }[] }[] }[];
  return tests.flatMap((t) => t.checkpoints).find((c) => c.name === name)!.captures[0].captureId;
};

describe('visual feedback tools', () => {
  test('one work list across a partial run, and each request compared with its original', async ({ db, tenant }) => {
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const writer = await mcpClient({ token: (await createPat(tenant.adminUser, { scopes: ['read', 'write'] })).token });
    const coupon = { name: 'coupon-form', title: 'Coupon form', colour: '#ff0000', test: 'coupon' } as const;
    const email = { name: 'refund-email', title: 'Refund email', colour: '#00ff00', test: 'refund' } as const;

    const first = await run(tenant, db, 0, [coupon, email]);
    const couponA = await captureIn(writer, project, first, 'coupon-form');
    const emailA = await captureIn(writer, project, first, 'refund-email');
    await call(writer, 'comment_on_review', { project, capture: couponA, body: 'The persons field should be half as wide.', at: { x: 40, y: 20 } });
    // Changes requested without saying what: no thread, still a request.
    await call(writer, 'review_checkpoint', { project, captures: [emailA], decision: 'changes_requested' });

    const before = await call(writer, 'list_feedback_requests', { project, branch: BRANCH });
    expect(before.isError).toBeFalsy();
    expect(before.structuredContent).toMatchObject({ scope: `library branch:${BRANCH}`, counts: { total: 2, threads: 1, captureRequests: 1, waiting: 2, verify: 0 } });

    // A partial run runs the coupon test only, and its form changed.
    const second = await run(tenant, db, 5, [{ ...coupon, colour: '#0000ff' }]);
    const couponB = await captureIn(writer, project, second, 'coupon-form');
    const after = await call(writer, 'list_feedback_requests', { project, branch: BRANCH });
    const requests = after.structuredContent!.requests as Request[];
    expect(after.structuredContent).toMatchObject({ counts: { total: 2, threads: 1, captureRequests: 1, verify: 1, waiting: 1 }, nextCursor: null });
    const thread = requests.find((r) => r.kind === 'thread')!;
    expect(thread).toMatchObject({ stage: 'verify', thread: 1, checkpoint: { key: 'coupon-form' }, current: { captureId: couponB, run: second }, original: { captureId: couponA, run: first } });
    expect(thread.conversation[0].body).toBe('The persons field should be half as wide.');
    // The screen the partial run skipped keeps its request.
    expect(requests.find((r) => r.kind === 'capture')).toMatchObject({ stage: 'waiting', checkpoint: { key: 'refund-email' }, current: { captureId: emailA, run: first }, original: null });
    expect(after.structuredContent!.producers).toMatchObject([
      { file: 'tests/coupon.spec.ts', titlePath: expect.arrayContaining(['buys a coupon']), requests: 1, checkpoints: ['coupon-form'] },
      { file: 'tests/refund.spec.ts', requests: 1, checkpoints: ['refund-email'] },
    ]);

    // Paged: counts cover every page.
    const page = await call(writer, 'list_feedback_requests', { project, branch: BRANCH, limit: 1 });
    expect(page.structuredContent).toMatchObject({ counts: { total: 2, returned: 1 } });
    const rest = await call(writer, 'list_feedback_requests', { project, branch: BRANCH, limit: 1, cursor: page.structuredContent!.nextCursor });
    expect((rest.structuredContent!.requests as Request[])[0].requestId).not.toBe((page.structuredContent!.requests as Request[])[0].requestId);
    expect(rest.structuredContent!.nextCursor).toBeNull();

    // Then and now at the pin, nothing else: against the image the thread was made on.
    const focused = await call(writer, 'get_review_checkpoint', { project, capture: couponB, thread: 1, images: 'focus' });
    expect(focused.structuredContent).toMatchObject({ comparison: { role: 'origin', captureId: couponA, run: first, available: true, identical: false } });
    expect((focused.structuredContent!.attachedImages as { role: string; thread: number | null }[]).map((i) => [i.role, i.thread])).toEqual([
      ['thread-close-up', 1],
      ['compared-thread-close-up', 1],
    ]);
    expect((focused.content as { type: string }[]).filter((c) => c.type === 'image')).toHaveLength(2);

    // Nothing approved: the run before is the comparison, attached — not a missing baseline.
    const auto = await call(writer, 'get_review_checkpoint', { project, capture: couponB, compare: true });
    expect(auto.structuredContent).toMatchObject({ comparison: { role: 'previous', captureId: couponA, available: true } });
    expect((auto.structuredContent!.attachedImages as { role: string }[]).map((i) => i.role)).toContain('compared');
    const baseline = await call(writer, 'get_review_checkpoint', { project, capture: couponB, against: 'baseline', images: 'none' });
    expect(baseline.structuredContent).toMatchObject({ comparison: null, note: expect.stringContaining('no baseline') });

    // An image budget: what is left out is named.
    const budget = await call(writer, 'get_review_checkpoint', { project, capture: couponB, maxImages: 1 });
    expect((budget.content as { type: string }[]).filter((c) => c.type === 'image')).toHaveLength(1);
    expect((budget.structuredContent!.omittedImages as string[]).length).toBeGreaterThan(0);

    // The email is captured again, changed: its request is now to verify, against the image it was made on.
    const third = await run(tenant, db, 10, [{ ...email, colour: '#00aa00' }]);
    const emailC = await captureIn(writer, project, third, 'refund-email');
    const later = await call(writer, 'list_feedback_requests', { project, branch: BRANCH, stage: 'verify' });
    expect((later.structuredContent!.requests as Request[]).find((r) => r.kind === 'capture')).toMatchObject({ current: { captureId: emailC }, original: { captureId: emailA, run: first } });
    const emailShown = await call(writer, 'get_review_checkpoint', { project, capture: emailC, against: 'origin', images: 'none' });
    expect(emailShown.structuredContent).toMatchObject({ comparison: { role: 'origin', captureId: emailA }, request: { onThisImage: false } });

    // Approving the new email ends its request.
    await call(writer, 'review_checkpoint', { project, captures: [emailC], decision: 'approved' });
    const done = await call(writer, 'list_feedback_requests', { project, branch: BRANCH });
    expect(done.structuredContent).toMatchObject({ counts: { total: 1, captureRequests: 0 } });
    await writer.close();
  });
});
