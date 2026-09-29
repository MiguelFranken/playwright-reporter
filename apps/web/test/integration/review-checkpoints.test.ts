/**
 * Review checkpoints end to end: the reporter's records (and the older
 * `review:<name>:<variant>` naming) become checkpoints and captures at ingest,
 * statuses follow the decisions about exact pixels, and an approved image
 * survives the retention sweep as the baseline.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { attachments, reviewCaptures, reviewCheckpoints } from '@/lib/db/schema';
import { captureHistory, decide, reviewQueue, runReview, runReviewCounts, screenCatalogue } from '@/lib/review/queries';
import { dueWhere } from '@/lib/storage/retention';
import { casesOfTests } from '@/lib/review/cases';
import { createCase, ensureSuite, linkTests } from '@/lib/test-cases/service';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from './factories';
import { describe, expect, test, type Db, type Tenant } from './fixtures';

const KEY = 'tests/checkout.spec.ts::books a workshop';
const sha = (c: string) => c.repeat(64);

async function runWithCheckpoints(tenant: Tenant, opts: { hashes: [string, string]; branch?: string; startedAt?: Date }) {
  const startedAt = opts.startedAt ?? new Date();
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString(), git: { branch: opts.branch ?? 'main' } }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const desktop = attachmentRef({ name: 'review:booking-ready:desktop' });
  const mobile = attachmentRef({ name: 'review:booking-ready:mobile' });
  const thumb = attachmentRef({ name: 'review:booking-ready:desktop:thumb', contentType: 'image/jpeg' });
  const video = attachmentRef({ name: 'video', contentType: 'video/webm' });
  const checkpoints: Checkpoint[] = [
    {
      name: 'booking-ready',
      title: 'Booking form filled in',
      sequence: 0,
      capturedAt: new Date(startedAt.getTime() + 4200).toISOString(),
      stepPath: ['Book the workshop'],
      url: 'https://shop.test/book',
      kind: 'page',
      variants: [
        { variant: 'desktop', attachmentId: desktop.id, thumbnailAttachmentId: thumb.id, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, fullPage: true, width: 2560, height: 4000, sha256: opts.hashes[0] },
        { variant: 'mobile', attachmentId: mobile.id, viewport: { width: 390, height: 844 }, sha256: opts.hashes[1] },
        // Not an attachment of this attempt: dropped.
        { variant: 'tablet', attachmentId: randomUUID() },
      ],
    },
  ];
  await ingestEvents(
    tenant.tokenProject,
    run,
    eventBatch([
      testBegin({ seq: 0, testKey: KEY, file: 'tests/checkout.spec.ts', title: 'books a workshop' }),
      attemptEnd({ seq: 1, testKey: KEY, startedAt: startedAt.toISOString(), attachments: [video, desktop, mobile, thumb], checkpoints }),
    ]),
  );
  return { run, desktop, mobile, thumb, video };
}

async function statuses(runId: string, startedAt: Date) {
  const flows = await runReview({ id: runId, startedAt });
  return Object.fromEntries(flows[0].checkpoints[0].captures.map((c) => [c.variant, c.status]));
}

describe('ingest', () => {
  test('stores a checkpoint record with its variants, in attachment order', async ({ db, tenant }) => {
    const { run, desktop, thumb, video } = await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('b')] });

    const [cp] = await db.select().from(reviewCheckpoints).where(eq(reviewCheckpoints.runId, run.id));
    expect(cp).toMatchObject({ name: 'booking-ready', title: 'Booking form filled in', stepPath: ['Book the workshop'], offsetMs: 4200, source: 'record' });
    const captures = await db.select().from(reviewCaptures).where(eq(reviewCaptures.checkpointId, cp.id));
    expect(captures.map((c) => c.variant).sort()).toEqual(['desktop', 'mobile']);
    expect(captures.find((c) => c.variant === 'desktop')).toMatchObject({ attachmentId: desktop.id, thumbnailAttachmentId: thumb.id, viewportWidth: 1280, deviceScaleFactor: 2, sha256: sha('a') });

    const ordinals = await db.select({ id: attachments.id, ordinal: attachments.ordinal }).from(attachments).where(eq(attachments.runId, run.id));
    expect(ordinals.find((a) => a.id === video.id)?.ordinal).toBe(0);
    expect(ordinals.find((a) => a.id === thumb.id)?.ordinal).toBe(3);
  });

  test('reads review:<name>:<variant> names when the reporter sends no record', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY }),
        attemptEnd({
          seq: 1,
          testKey: KEY,
          attachments: [
            attachmentRef({ name: 'review:ready:desktop' }),
            attachmentRef({ name: 'review:ready:mobile' }),
            attachmentRef({ name: 'review:done:desktop' }),
            attachmentRef({ name: 'screenshot' }),
          ],
        }),
      ]),
    );
    const cps = await db.select().from(reviewCheckpoints).orderBy(reviewCheckpoints.sequence);
    expect(cps.map((c) => [c.name, c.sequence, c.source])).toEqual([
      ['ready', 0, 'legacy'],
      ['done', 1, 'legacy'],
    ]);
    expect(await db.select().from(reviewCaptures)).toHaveLength(3);
  });
});

describe('migration', () => {
  test('backfills checkpoints from review screenshots ingested before they existed', async ({ db, tenant }) => {
    const started = await startRun(tenant.tokenProject, runStart());
    const run = await getRunForProject(tenant.tokenProject, started.runId);
    await ingestEvents(
      tenant.tokenProject,
      run,
      eventBatch([
        testBegin({ seq: 0, testKey: KEY }),
        attemptEnd({
          seq: 1,
          testKey: KEY,
          attachments: [
            attachmentRef({ name: 'review:ready:desktop' }),
            attachmentRef({ name: 'review:ready:mobile' }),
            attachmentRef({ name: 'review:solo' }),
            attachmentRef({ name: 'review:ready:desktop:thumb' }),
            attachmentRef({ name: 'review:notes:desktop', contentType: 'text/plain' }),
          ],
        }),
      ]),
    );
    // The state before the migration: attachments, no checkpoints.
    await db.delete(reviewCheckpoints);
    const migration = await readFile(path.join(import.meta.dirname, '../../lib/db/migrations/0013_review_checkpoints.sql'), 'utf8');
    const backfill = migration.split('--> statement-breakpoint').at(-1)!;
    await db.execute(sql.raw(backfill));

    const cps = await db.select().from(reviewCheckpoints);
    expect(cps.map((c) => c.name).sort()).toEqual(['ready', 'solo']);
    expect(cps.every((c) => c.source === 'legacy')).toBe(true);
    expect([...cps.map((c) => c.sequence)].sort()).toEqual([0, 1]);
    const captures = await db.select().from(reviewCaptures);
    expect(captures.map((c) => `${c.checkpointName}:${c.variant}`).sort()).toEqual(['ready:desktop', 'ready:mobile', 'solo:default']);
  });
});

describe('statuses', () => {
  test('new, then approved; an identical image inherits the approval, a different one is changed', async ({ db, tenant }) => {
    const t0 = new Date(Date.now() - 3 * 60_000);
    const first = await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('b')], startedAt: t0 });
    expect(await statuses(first.run.id, t0)).toEqual({ desktop: 'new', mobile: 'new' });

    const flows = await runReview({ id: first.run.id, startedAt: t0 });
    const desktopCapture = flows[0].checkpoints[0].captures.find((c) => c.variant === 'desktop')!;
    const mobileCapture = flows[0].checkpoints[0].captures.find((c) => c.variant === 'mobile')!;
    await decide({ projectId: tenant.project.id, captureIds: [desktopCapture.id], decision: 'approved', userId: tenant.adminUser.id });
    await decide({ projectId: tenant.project.id, captureIds: [mobileCapture.id], decision: 'changes_requested', comment: 'Button wraps', userId: tenant.adminUser.id });
    expect(await statuses(first.run.id, t0)).toEqual({ desktop: 'approved', mobile: 'changes_requested' });

    const t1 = new Date(Date.now() - 2 * 60_000);
    const second = await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('c')], startedAt: t1 });
    const [flow] = await runReview({ id: second.run.id, startedAt: t1 });
    const [desktop, mobile] = [...flow.checkpoints[0].captures].sort((a, b) => a.variant.localeCompare(b.variant));
    expect(desktop.status).toBe('approved');
    expect(desktop.baseline?.capture?.id).toBe(desktopCapture.id);
    expect(desktop.previous?.capture.id).toBe(desktopCapture.id);
    // The mobile image changed and was never approved: new, compared with the run before.
    expect(mobile.status).toBe('new');
    expect(mobile.previous?.capture.sha256).toBe(sha('b'));
    expect(flow.video).not.toBeNull();

    // A different desktop image after an approval is `changed`.
    const t2 = new Date(Date.now() - 60_000);
    const third = await runWithCheckpoints(tenant, { hashes: [sha('d'), sha('c')], startedAt: t2 });
    expect(await statuses(third.run.id, t2)).toEqual({ desktop: 'changed', mobile: 'new' });

    const counts = await runReviewCounts([third.run.id]);
    expect(counts[third.run.id]).toEqual({ approved: 0, changes_requested: 0, changed: 1, new: 1 });
    const queue = await reviewQueue(tenant.project.id);
    expect(queue.map((q) => q.number)).toEqual([third.run.number, second.run.number, first.run.number]);

    const history = await captureHistory(tenant.project.id, flow.testId, 'booking-ready', 'desktop');
    expect(history.map((h) => h.status)).toEqual(['changed', 'approved', 'approved']);

    const screens = await screenCatalogue(tenant.project.id, 'main');
    expect(screens.map((s) => [s.variant, s.approved])).toEqual([
      ['desktop', true],
      ['mobile', false],
    ]);
    void db;
  });

  test('ignores captures of another project', async ({ db, tenant }) => {
    await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('b')] });
    const [capture] = await db.select().from(reviewCaptures);
    await expect(decide({ projectId: randomUUID(), captureIds: [capture.id], decision: 'approved', userId: null })).rejects.toThrow('not in this project');
  });
});

describe('retention', () => {
  test('keeps the newest approved image of a checkpoint', async ({ db, tenant }) => {
    const { desktop, mobile, thumb } = await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('b')] });
    const [desktopCapture] = await db.select().from(reviewCaptures).where(eq(reviewCaptures.attachmentId, desktop.id));
    await decide({ projectId: tenant.project.id, captureIds: [desktopCapture.id], decision: 'approved', userId: null });
    await markUploaded(db);

    const policy = { enabled: true, days: 1, overrides: {} };
    const due = await db.select({ id: attachments.id }).from(attachments).where(dueWhere(policy, new Date(Date.now() + 2 * 86_400_000)));
    const ids = due.map((d) => d.id);
    expect(ids).toContain(mobile.id);
    expect(ids).not.toContain(desktop.id);
    expect(ids).not.toContain(thumb.id);
  });
});

async function markUploaded(db: Db) {
  await db.update(attachments).set({ status: 'uploaded' });
}

describe('test cases', () => {
  test('a flow knows the cases its test is linked to, with their suite path', async ({ db, tenant }) => {
    await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('b')] });
    const [capture] = await db.select().from(reviewCaptures);
    const ctx = { projectId: tenant.project.id, teamId: tenant.team.id, actorId: tenant.adminUser.id };
    const suiteId = await ensureSuite(ctx, ['Checkout', 'Ordering']);
    const linked = await createCase(ctx, { title: 'Book a workshop', suiteId });
    await linkTests(ctx, linked.id, [capture.testId]);
    const unfiled = await createCase(ctx, { title: 'Booking works on mobile' });
    await linkTests(ctx, unfiled.id, [capture.testId]);

    const byTest = await casesOfTests(tenant.project.id, [capture.testId, randomUUID()]);
    expect(byTest[capture.testId]).toEqual([
      { key: `TC-${linked.number}`, title: 'Book a workshop', suitePath: ['Checkout', 'Ordering'] },
      { key: `TC-${unfiled.number}`, title: 'Booking works on mobile', suitePath: [] },
    ]);
    const screens = await screenCatalogue(tenant.project.id, 'main', { testIds: [capture.testId] });
    expect(screens.length).toBe(2);
    expect(await screenCatalogue(tenant.project.id, 'main', { testIds: [] })).toEqual([]);
  });
});
