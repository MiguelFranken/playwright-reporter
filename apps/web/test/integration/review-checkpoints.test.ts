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
import { attachments, projects, reviewCaptures, reviewCheckpoints, reviewDecisions } from '@/lib/db/schema';
import { captureHistory, decide, reviewQueue, runCapturesByScreen, runCompareTargetsOf, runReview, runReviewCounts } from '@/lib/review/queries';
import { compareRunReview, toRunReviewData } from '@/lib/review/run-flows';
import { libraryFlows } from '@/lib/review/library';
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
  test('new, then approved; an identical image inherits the approval, a different one is changed, an unapproved one is compared with the run before', async ({ db, tenant }) => {
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
    // The mobile image was never approved: compared with the run before, it changed.
    expect(mobile.status).toBe('changed');
    expect(mobile.previous?.capture.sha256).toBe(sha('b'));
    expect(flow.video).not.toBeNull();

    // A different desktop image after an approval is `changed`; the run before's very mobile pixels, never approved, are `unchanged`.
    const t2 = new Date(Date.now() - 60_000);
    const third = await runWithCheckpoints(tenant, { hashes: [sha('d'), sha('c')], startedAt: t2 });
    expect(await statuses(third.run.id, t2)).toEqual({ desktop: 'changed', mobile: 'unchanged' });

    // The counts in SQL follow the same rule.
    const counts = await runReviewCounts([third.run.id, second.run.id, first.run.id]);
    expect(counts[third.run.id]).toEqual({ approved: 0, changes_requested: 0, changed: 1, unchanged: 1, new: 0 });
    expect(counts[second.run.id]).toEqual({ approved: 1, changes_requested: 0, changed: 1, unchanged: 0, new: 0 });
    expect(counts[first.run.id]).toEqual({ approved: 1, changes_requested: 1, changed: 0, unchanged: 0, new: 0 });
    const queue = await reviewQueue(tenant.project.id);
    expect(queue.map((q) => q.number)).toEqual([third.run.number, second.run.number, first.run.number]);

    const history = await captureHistory(tenant.project.id, flow.testId, 'booking-ready', 'desktop');
    expect(history.map((h) => h.status)).toEqual(['changed', 'approved', 'approved']);

    void db;
  });

  test('ignores captures of another project', async ({ db, tenant }) => {
    await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('b')] });
    const [capture] = await db.select().from(reviewCaptures);
    await expect(decide({ projectId: randomUUID(), captureIds: [capture.id], decision: 'approved', userId: null })).rejects.toThrow('not in this project');
  });
});

describe('comparing a whole run', () => {
  test('lists the other runs with the screens they share, and compares every screen with the one chosen', async ({ tenant }) => {
    const t0 = new Date(Date.now() - 3 * 60_000);
    const first = await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('b')], startedAt: t0 });
    const [firstFlow] = await runReview({ id: first.run.id, startedAt: t0 });
    const firstDesktop = firstFlow.checkpoints[0].captures.find((c) => c.variant === 'desktop')!;
    await decide({ projectId: tenant.project.id, captureIds: [firstDesktop.id], decision: 'approved', userId: tenant.adminUser.id });
    const t1 = new Date(Date.now() - 2 * 60_000);
    const second = await runWithCheckpoints(tenant, { hashes: [sha('c'), sha('b')], branch: 'feat/x', startedAt: t1 });
    const t2 = new Date(Date.now() - 60_000);
    const third = await runWithCheckpoints(tenant, { hashes: [sha('d'), sha('e')], startedAt: t2 });

    const targets = await runCompareTargetsOf(tenant.project.id, third.run.id);
    expect(targets.map((t) => [t.runNumber, t.branch, t.screens])).toEqual([
      [second.run.number, 'feat/x', 2],
      [first.run.number, 'main', 2],
    ]);
    expect((await runCapturesByScreen(tenant.project.id, second.run.number))?.captures.size).toBe(2);
    expect(await runCapturesByScreen(tenant.project.id, 9999)).toBeNull();

    const records = await runReview({ id: third.run.id, startedAt: t2 });
    const data = toRunReviewData(records, {}, '/teams/t/projects/p', third.run.number);
    const comparedWith = (rule: Parameters<typeof compareRunReview>[3], recs = records, d = data) =>
      compareRunReview(tenant.project.id, recs, d, rule).then((r) => Object.fromEntries(r.flows[0].checkpoints[0].captures.map((c) => [c.variant, { compare: c.compare ?? null, status: c.status }])));
    const compared = (rule: Parameters<typeof compareRunReview>[3]) => comparedWith(rule).then((r) => ({ desktop: r.desktop.compare, mobile: r.mobile.compare }));

    // Against run #first: every screen names the run it is compared with, also desktop, whose approved baseline it is anyway.
    const withFirst = await comparedWith(`run:${first.run.number}`);
    expect(withFirst.desktop).toMatchObject({ compare: { label: `Run #${first.run.number}`, runNumber: first.run.number, same: false }, status: 'changed' });
    expect(withFirst.mobile).toMatchObject({ compare: { label: `Run #${first.run.number}`, runNumber: first.run.number, same: false }, status: 'changed' });
    // The run before: both screens are compared with run #second.
    const withBefore = await compared('previous');
    expect(withBefore.desktop).toMatchObject({ label: `Run #${second.run.number}`, runNumber: second.run.number });
    expect(withBefore.mobile).toMatchObject({ label: `Run #${second.run.number}`, runNumber: second.run.number });
    // The default, and the rules the viewer picks per image, change nothing.
    expect(await compared('auto')).toEqual({ desktop: null, mobile: null });
    expect(await compared('comments')).toEqual({ desktop: null, mobile: null });
    // A run that does not exist leaves the review as it is.
    expect(await compared('run:9999')).toEqual({ desktop: null, mobile: null });

    // Compared with the run before, the baseline plays no part: the desktop screen differs from the approved one
    // (`changed` by default) but has the run before's very pixels, so it is `unchanged`; a screen that run did not capture is `new`.
    const t3 = new Date(Date.now() - 30_000);
    const fourth = await runWithCheckpoints(tenant, { hashes: [sha('d'), sha('f')], startedAt: t3 });
    const fourthRecords = await runReview({ id: fourth.run.id, startedAt: t3 });
    const fourthData = toRunReviewData(fourthRecords, {}, '/teams/t/projects/p', fourth.run.number);
    expect(Object.fromEntries(fourthData.flows[0].checkpoints[0].captures.map((c) => [c.variant, c.status]))).toEqual({ desktop: 'changed', mobile: 'changed' });
    const fourthBefore = await comparedWith('previous', fourthRecords, fourthData);
    expect(fourthBefore.desktop).toMatchObject({ compare: { runNumber: third.run.number, same: true }, status: 'unchanged' });
    expect(fourthBefore.mobile).toMatchObject({ compare: { runNumber: third.run.number, same: false }, status: 'changed' });
  });
});

describe('retention', () => {
  const policy = { enabled: true, days: 1, overrides: {}, keepVisuals: true };
  const later = () => new Date(Date.now() + 2 * 86_400_000);

  // Off the library (not the default branch), so only the baseline rule keeps anything.
  const offLibrary = (db: Db, tenant: Tenant) => db.update(projects).set({ settings: { defaultBranch: 'main' } }).where(eq(projects.id, tenant.project.id));

  test('keeps the newest approved image of a checkpoint', async ({ db, tenant }) => {
    await offLibrary(db, tenant);
    const { desktop, mobile, thumb } = await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('b')], branch: 'feat/x' });
    const [desktopCapture] = await db.select().from(reviewCaptures).where(eq(reviewCaptures.attachmentId, desktop.id));
    await decide({ projectId: tenant.project.id, captureIds: [desktopCapture.id], decision: 'approved', userId: null });
    await markUploaded(db);

    const due = await db.select({ id: attachments.id }).from(attachments).where(dueWhere(policy, later()));
    const ids = due.map((d) => d.id);
    expect(ids).toContain(mobile.id);
    expect(ids).not.toContain(desktop.id);
    expect(ids).not.toContain(thumb.id);
  });

  test('an approval the tolerance made does not replace the baseline a person approved', async ({ db, tenant }) => {
    await offLibrary(db, tenant);
    const first = await runWithCheckpoints(tenant, { hashes: [sha('a'), sha('b')], branch: 'feat/x', startedAt: new Date(Date.now() - 60_000) });
    const [baseline] = await db.select().from(reviewCaptures).where(eq(reviewCaptures.attachmentId, first.desktop.id));
    await decide({ projectId: tenant.project.id, captureIds: [baseline.id], decision: 'approved', userId: null });
    const second = await runWithCheckpoints(tenant, { hashes: [sha('c'), sha('b')], branch: 'feat/x' });
    const [next] = await db.select().from(reviewCaptures).where(eq(reviewCaptures.attachmentId, second.desktop.id));
    await db.insert(reviewDecisions).values({
      id: randomUUID(),
      projectId: tenant.project.id,
      testId: next.testId,
      checkpointName: next.checkpointName,
      variant: next.variant,
      sha256: next.sha256,
      captureId: next.id,
      runId: next.runId,
      decision: 'approved',
      source: 'tolerance',
    });
    await markUploaded(db);

    const ids = (await db.select({ id: attachments.id }).from(attachments).where(dueWhere(policy, later()))).map((d) => d.id);
    // The viewer still compares against the image a person approved.
    expect(ids).not.toContain(first.desktop.id);
    expect(ids).toContain(second.desktop.id);
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
    const unfiled = await createCase(ctx, { title: 'Booking works on mobile', priority: 'high' });
    await linkTests(ctx, unfiled.id, [capture.testId]);

    const byTest = await casesOfTests(tenant.project.id, [capture.testId, randomUUID()]);
    expect(byTest[capture.testId]).toEqual([
      { key: `TC-${linked.number}`, title: 'Book a workshop', suitePath: ['Checkout', 'Ordering'], priority: 'none' },
      { key: `TC-${unfiled.number}`, title: 'Booking works on mobile', suitePath: [], priority: 'high' },
    ]);
    const flows = await libraryFlows(tenant.project.id, { kind: 'branch', branch: 'main' }, { testIds: [capture.testId] });
    expect(flows[0].checkpoints[0].captures.length).toBe(2);
    expect(await libraryFlows(tenant.project.id, { kind: 'branch', branch: 'main' }, { testIds: [] })).toEqual([]);
  });
});
