/**
 * Comment threads through MCP: an assistant pins change requests on an image,
 * sees them drawn on it as numbered pins with close-ups and the same numbers
 * in the text, replies and resolves — writing only with a write-scoped token
 * and a role that may comment.
 */
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { attachments, reviewComments } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { GET as annotatedImage } from '@/app/api/review-captures/[captureId]/annotated/route';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from '../factories';
import { createMember, describe, expect, test, type Db, type Tenant } from '../fixtures';
import { call, createPat, mcpClient } from './client';

const KEY = 'tests/checkout.spec.ts::places an order';

async function reviewRun(tenant: Tenant, db: Db) {
  const started = await startRun(tenant.tokenProject, runStart());
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const desktop = attachmentRef({ name: 'review:checkout-ready:desktop' });
  const checkpoints: Checkpoint[] = [
    { name: 'checkout-ready', title: 'Checkout filled in', sequence: 0, variants: [{ variant: 'desktop', attachmentId: desktop.id, sha256: 'a'.repeat(64), viewport: { width: 640, height: 400 }, deviceScaleFactor: 2, width: 1280, height: 800 }] },
  ];
  await ingestEvents(
    tenant.tokenProject,
    run,
    eventBatch([testBegin({ seq: 0, testKey: KEY, title: 'places an order', file: 'tests/checkout.spec.ts' }), attemptEnd({ seq: 1, testKey: KEY, attachments: [desktop], checkpoints })]),
  );
  // A real image in the store, so the pins are drawn onto something.
  const png = await sharp({ create: { width: 1280, height: 800, channels: 3, background: '#f6f6f7' } }).png().toBuffer();
  const [row] = await db.select().from(attachments).where(eq(attachments.id, desktop.id));
  await getStorage().put(row.storageKey, new Uint8Array(png), { contentType: 'image/png' });
  await db.update(attachments).set({ status: 'uploaded', sizeBytes: png.byteLength }).where(eq(attachments.id, desktop.id));
  return started.runNumber;
}

type Threads = { number: number; status: string; percent: { x: number; y: number } | null; pixels: { x: number; y: number } | null; css: { x: number; y: number } | null; comments: { body: string; via: string }[]; url: string }[];

describe('review thread tools', () => {
  test('pins, lists, shows pinned, replies and resolves', async ({ db, tenant }) => {
    const runNumber = await reviewRun(tenant, db);
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const writer = await mcpClient({ token: (await createPat(tenant.adminUser, { scopes: ['read', 'write'] })).token });

    const listed = await call(writer, 'list_review_checkpoints', { project, run: runNumber });
    const captureId = (listed.structuredContent!.tests as { checkpoints: { captures: { captureId: string }[] }[] }[])[0].checkpoints[0].captures[0].captureId;

    const pinned = await call(writer, 'comment_on_review', { project, capture: captureId, body: 'The order button should be primary.', at: { x: 50, y: 25 } });
    expect(pinned.structuredContent).toMatchObject({ action: 'created', thread: 1 });
    expect(pinned.structuredContent!.url).toMatch(/\/runs\/\d+\/review\?cp=.+&v=desktop&thread=1$/);
    const area = await call(writer, 'comment_on_review', { project, capture: captureId, body: 'Totals lost their border.', at: { x: 10, y: 60, w: 30, h: 10 } });
    expect(area.structuredContent).toMatchObject({ thread: 2 });
    const general = await call(writer, 'comment_on_review', { project, capture: captureId, body: 'Feels cramped overall.' });
    expect(general.structuredContent).toMatchObject({ thread: 3 });

    const threads = await call(writer, 'list_review_threads', { project, run: runNumber });
    expect(threads.structuredContent).toMatchObject({ counts: { open: 3, resolved: 0 } });
    const [img] = threads.structuredContent!.images as { threads: Threads }[];
    expect(img.threads[0]).toMatchObject({ number: 1, status: 'open', percent: { x: 50, y: 25 }, pixels: { x: 640, y: 200 }, css: { x: 320, y: 100 }, comments: [{ body: 'The order button should be primary.', via: 'mcp' }] });
    expect(img.threads[2]).toMatchObject({ number: 3, pixels: null });

    // The image with its pins, a close-up per pin, and the threads by the same numbers.
    const shown = await call(writer, 'get_review_checkpoint', { project, capture: captureId });
    const images = (shown.content as { type: string }[]).filter((c) => c.type === 'image');
    expect(images).toHaveLength(3);
    expect(shown.structuredContent).toMatchObject({ attachments: ['this run’s image, with the open threads pinned', 'a close-up of #1', 'a close-up of #2'], image: { width: 1280, height: 800 } });
    expect((shown.structuredContent!.threads as Threads).map((t) => t.number)).toEqual([1, 2, 3]);
    const text = (shown.content as { type: string; text?: string }[]).find((c) => c.type === 'text')!.text!;
    expect(text).toContain('**#1**');
    expect(text).toContain('The order button should be primary.');

    const focused = await call(writer, 'get_review_checkpoint', { project, capture: captureId, thread: 2, compare: false });
    expect(focused.structuredContent).toMatchObject({ attachments: ['this run’s image, with the open threads pinned', 'a close-up of #2'] });

    // The REST API's link: the image with its pins drawn on it.
    const annotatedUrl = shown.structuredContent!.annotatedImageUrl as string;
    const res = await annotatedImage(new Request(annotatedUrl), { params: Promise.resolve({ captureId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const forged = await annotatedImage(new Request(annotatedUrl.replace(/sig=[^&]+/, 'sig=nope')), { params: Promise.resolve({ captureId }) });
    expect(forged.status).toBe(404);

    const replied = await call(writer, 'comment_on_review', { project, capture: captureId, thread: 1, body: 'Done in 9f2c1ab.' });
    expect(replied.structuredContent).toMatchObject({ action: 'replied', thread: 1 });
    const resolved = await call(writer, 'resolve_review_thread', { project, capture: captureId, thread: 1, comment: 'Verified on the next run.' });
    expect(resolved.structuredContent).toMatchObject({ thread: 1, status: 'resolved', changed: true });
    const again = await call(writer, 'resolve_review_thread', { project, capture: captureId, thread: 1 });
    expect(again.structuredContent).toMatchObject({ changed: false });
    expect((await db.select().from(reviewComments)).filter((c) => c.source === 'mcp')).toHaveLength(6);

    const open = await call(writer, 'list_review_threads', { project, capture: captureId });
    expect((open.structuredContent!.images as { threads: Threads }[])[0].threads.map((t) => t.number)).toEqual([2, 3]);
    const missing = await call(writer, 'resolve_review_thread', { project, capture: captureId, thread: 9 });
    expect(missing.isError).toBe(true);

    // A change request with pins, in one call.
    const decided = await call(writer, 'review_checkpoint', { project, captures: [captureId], decision: 'changes_requested', pins: [{ x: 90, y: 5, comment: 'Cart badge overlaps.' }] });
    expect(decided.structuredContent).toMatchObject({ decided: 1, pinned: [{ number: 4 }] });
    await writer.close();
  });

  test('a read-only token cannot comment, and a viewer may', async ({ db, tenant }) => {
    const runNumber = await reviewRun(tenant, db);
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const reader = await mcpClient({ token: (await createPat(tenant.adminUser)).token });
    expect((await reader.listTools()).tools.map((t) => t.name)).not.toContain('comment_on_review');
    await reader.close();

    const viewer = await createMember(db, tenant.team.id, 'viewer');
    const client = await mcpClient({ token: (await createPat(viewer, { scopes: ['read', 'write'] })).token });
    const listed = await call(client, 'list_review_checkpoints', { project, run: runNumber });
    const captureId = (listed.structuredContent!.tests as { checkpoints: { captures: { captureId: string }[] }[] }[])[0].checkpoints[0].captures[0].captureId;
    const pinned = await call(client, 'comment_on_review', { project, capture: captureId, body: 'Typo in the heading.', at: { x: 20, y: 10 } });
    expect(pinned.isError).toBeFalsy();
    const decided = await call(client, 'review_checkpoint', { project, captures: [captureId], decision: 'approved' });
    expect(decided.isError).toBe(true);
    await client.close();
  });
});
