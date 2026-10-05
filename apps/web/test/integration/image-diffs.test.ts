/**
 * Measured image comparisons end to end: a run is planned against its
 * references, each pair measured once from the attachment store, the result
 * shown on every capture of the same pixels, tolerable noise approved for the
 * reviewer without becoming a baseline, and comparisons that lost their
 * images swept away.
 */
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun, storeUpload } from '@/lib/ingest/service';
import { attachments, imageDiffs, projects, reviewCaptures, reviewDecisions, reviewIgnoreRegions } from '@/lib/db/schema';
import { captureInProject, decide, runReview, runReviewCounts } from '@/lib/review/queries';
import { approveWithinTolerance, measureDiff, needsPlanning, planPairs, planRun, sweepDiffs } from '@/lib/review/diff/store';
import { diffSettingsFor, pairOf } from '@/lib/review/diff/lookup';
import { compareRunRecords } from '@/lib/review/run-flows';
import { getStorage } from '@/lib/storage';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from './factories';
import { describe, expect, test, type Db, type Tenant } from './fixtures';

const KEY = 'tests/checkout.spec.ts::books a workshop';

type Box = { x: number; y: number; width: number; height: number };

/** A white page with black boxes on it, as a PNG. */
async function page(boxes: Box[] = [], opts: { width?: number; height?: number; compression?: number } = {}) {
  const width = opts.width ?? 120;
  const height = opts.height ?? 90;
  const data = Buffer.alloc(width * height * 4, 255);
  for (const b of boxes) for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: opts.compression ?? 6 })
    .toBuffer();
}

const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** A run of one test with one checkpoint in two variants, both images uploaded. */
async function runWith(tenant: Tenant, images: { desktop: Buffer; mobile: Buffer }, startedAt = new Date()) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const desktop = attachmentRef({ name: 'review:booking-ready:desktop', size: images.desktop.length });
  const mobile = attachmentRef({ name: 'review:booking-ready:mobile', size: images.mobile.length });
  const checkpoints: Checkpoint[] = [
    {
      name: 'booking-ready',
      sequence: 0,
      stepPath: [],
      variants: [
        { variant: 'desktop', attachmentId: desktop.id, sha256: sha(images.desktop), width: 120, height: 90 },
        { variant: 'mobile', attachmentId: mobile.id, sha256: sha(images.mobile), width: 120, height: 90 },
      ],
    },
  ];
  await ingestEvents(
    tenant.tokenProject,
    run,
    eventBatch([testBegin({ seq: 0, testKey: KEY }), attemptEnd({ seq: 1, testKey: KEY, startedAt: startedAt.toISOString(), attachments: [desktop, mobile], checkpoints })]),
  );
  return { run, desktop, mobile };
}

async function upload(db: Db, attachmentId: string, bytes: Buffer) {
  const [row] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  await storeUpload(row, new Response(new Uint8Array(bytes)).body, 'image/png');
}

async function uploadAll(db: Db, r: Awaited<ReturnType<typeof runWith>>, images: { desktop: Buffer; mobile: Buffer }) {
  await upload(db, r.desktop.id, images.desktop);
  await upload(db, r.mobile.id, images.mobile);
}

async function captures(runId: string, startedAt: Date) {
  const flows = await runReview({ id: runId, startedAt });
  return Object.fromEntries(flows[0].checkpoints[0].captures.map((c) => [c.variant, c]));
}

async function measurePlan(runId: string) {
  const plan = await planRun(runId);
  for (const id of plan.ids) await measureDiff(id);
  return plan;
}

const t0 = new Date(Date.now() - 3_600_000);
const t1 = new Date(Date.now() - 1_800_000);

describe('planning and measuring', () => {
  test('measures a changed image against its approved baseline, and a new one against the run before', async ({ db, tenant }) => {
    const before = { desktop: await page(), mobile: await page([{ x: 0, y: 0, width: 5, height: 5 }]) };
    const first = await runWith(tenant, before, t0);
    await uploadAll(db, first, before);
    const firstCaps = await captures(first.run.id, t0);
    await decide({ projectId: tenant.project.id, captureIds: [firstCaps.desktop.id], decision: 'approved', userId: tenant.adminUser.id });

    const after = { desktop: await page([{ x: 20, y: 30, width: 10, height: 4 }]), mobile: await page([{ x: 100, y: 80, width: 6, height: 6 }]) };
    const second = await runWith(tenant, after, t1);
    await uploadAll(db, second, after);

    const plan = await planRun(second.run.id);
    expect(plan).toMatchObject({ waiting: 0 });
    expect(plan.ids).toHaveLength(2);
    // Planned twice: the same rows.
    expect((await planRun(second.run.id)).ids.sort()).toEqual([...plan.ids].sort());
    for (const id of plan.ids) expect(await measureDiff(id)).toBe('done');
    // Measured already: nothing to claim.
    expect(await measureDiff(plan.ids[0])).toBe('busy');

    const caps = await captures(second.run.id, t1);
    expect(caps.desktop).toMatchObject({ status: 'changed', diffAgainst: 'baseline', withinTolerance: false });
    expect(caps.desktop.diff).toMatchObject({ status: 'done', changedPixels: 40, totalPixels: 120 * 90, regions: [{ x: 20, y: 30, width: 10, height: 4, pixels: 40 }] });
    expect(caps.desktop.diff!.overlayKey).toBeTruthy();
    expect(await getStorage().head(caps.desktop.diff!.overlayKey!)).toMatchObject({ contentType: 'image/png' });
    // Nobody approved mobile: measured against the run before, and changed since.
    expect(caps.mobile).toMatchObject({ status: 'changed', diffAgainst: 'previous' });
    expect(caps.mobile.diff!.changedPixels).toBe(25 + 36);
    expect(needsPlanning(Object.values(caps))).toBe(false);
  });

  test('waits for images that are still uploading', async ({ db, tenant }) => {
    const before = { desktop: await page(), mobile: await page() };
    const first = await runWith(tenant, before, t0);
    await uploadAll(db, first, before);
    const after = { desktop: await page([{ x: 1, y: 1, width: 2, height: 2 }]), mobile: await page([{ x: 1, y: 1, width: 2, height: 2 }]) };
    const second = await runWith(tenant, after, t1);
    await upload(db, second.desktop.id, after.desktop);

    expect(await planRun(second.run.id)).toMatchObject({ waiting: 1 });
    expect((await planRun(second.run.id)).ids).toHaveLength(1);
  });

  test('an image too large for the pixel budget is recorded, not retried', async ({ db, tenant }) => {
    process.env.IMAGE_DIFF_MAX_PIXELS = '1000000';
    try {
      const big = await page([], { width: 1100, height: 1000 });
      const bigger = await page([{ x: 0, y: 0, width: 3, height: 3 }], { width: 1100, height: 1000 });
      const first = await runWith(tenant, { desktop: big, mobile: big }, t0);
      await uploadAll(db, first, { desktop: big, mobile: big });
      const second = await runWith(tenant, { desktop: bigger, mobile: bigger }, t1);
      await uploadAll(db, second, { desktop: bigger, mobile: bigger });
      const plan = await planRun(second.run.id);
      // Both variants have the same pixels: one comparison.
      expect(plan.ids).toHaveLength(1);
      expect(await measureDiff(plan.ids[0])).toBe('too_large');
      const [row] = await db.select().from(imageDiffs).where(eq(imageDiffs.id, plan.ids[0]));
      expect(row).toMatchObject({ status: 'too_large', headWidth: 1100, headHeight: 1000 });
    } finally {
      delete process.env.IMAGE_DIFF_MAX_PIXELS;
    }
  });

  test('ignored areas are left out, and changing them measures again', async ({ db, tenant }) => {
    const before = { desktop: await page(), mobile: await page() };
    const first = await runWith(tenant, before, t0);
    await uploadAll(db, first, before);
    const firstCaps = await captures(first.run.id, t0);
    await decide({ projectId: tenant.project.id, captureIds: [firstCaps.desktop.id], decision: 'approved', userId: tenant.adminUser.id });
    const after = { desktop: await page([{ x: 2, y: 2, width: 8, height: 8 }]), mobile: before.mobile };
    const second = await runWith(tenant, after, t1);
    await uploadAll(db, second, after);
    await measurePlan(second.run.id);
    expect((await captures(second.run.id, t1)).desktop.diff!.changedPixels).toBe(64);

    await db.insert(reviewIgnoreRegions).values({ id: randomUUID(), projectId: tenant.project.id, testId: firstCaps.desktop.testId, checkpointName: 'booking-ready', variant: 'desktop', regions: [{ x: 0, y: 0, width: 20, height: 20 }] });
    const caps = await captures(second.run.id, t1);
    // A new options key: the old measurement does not apply.
    expect(caps.desktop.diff).toBeNull();
    expect(caps.desktop.ignoreRegions).toHaveLength(1);
    await measurePlan(second.run.id);
    expect((await captures(second.run.id, t1)).desktop.diff).toMatchObject({ status: 'done', changedPixels: 0 });
  });
});

describe('tolerance', () => {
  test('approves the same pixels in a new encoding, for the reviewer and with a reason', async ({ db, tenant }) => {
    const img = await page([{ x: 10, y: 10, width: 20, height: 20 }]);
    const reencoded = await page([{ x: 10, y: 10, width: 20, height: 20 }], { compression: 1 });
    expect(sha(img)).not.toBe(sha(reencoded));
    const first = await runWith(tenant, { desktop: img, mobile: img }, t0);
    await uploadAll(db, first, { desktop: img, mobile: img });
    const firstCaps = await captures(first.run.id, t0);
    await decide({ projectId: tenant.project.id, captureIds: [firstCaps.desktop.id], decision: 'approved', userId: tenant.adminUser.id });

    const second = await runWith(tenant, { desktop: reencoded, mobile: reencoded }, t1);
    await uploadAll(db, second, { desktop: reencoded, mobile: reencoded });
    // Planned, not measured yet: neither a change nor the same until the pixels say so — in the storyboard and in the counts.
    const plan = await planRun(second.run.id);
    expect(await captures(second.run.id, t1)).toMatchObject({ desktop: { status: 'measuring' }, mobile: { status: 'measuring' } });
    expect((await runReviewCounts([second.run.id]))[second.run.id]).toMatchObject({ measuring: 2, changed: 0 });
    for (const id of plan.ids) expect(await measureDiff(id)).toBe('done');
    // Measured: other bytes, not one changed pixel — unchanged, against the approved image and against the run before alike.
    expect(await captures(second.run.id, t1)).toMatchObject({ desktop: { status: 'unchanged', withinTolerance: true }, mobile: { status: 'unchanged' } });
    expect((await runReviewCounts([second.run.id]))[second.run.id]).toMatchObject({ unchanged: 2, changed: 0, measuring: 0 });

    expect(await approveWithinTolerance(second.run.id)).toBe(1);
    const caps = await captures(second.run.id, t1);
    expect(caps.desktop.status).toBe('approved');
    expect(caps.desktop.decision).toMatchObject({ source: 'tolerance', by: null });
    expect(caps.desktop.decision!.comment).toMatch(/no visible change/);
    // The baseline stays the reviewer's image.
    expect(caps.desktop.baseline!.capture!.id).toBe(firstCaps.desktop.id);
    // Mobile has no approved baseline: nothing to be tolerant about, and nothing changed since the run before.
    expect(caps.mobile.status).toBe('unchanged');
    // Idempotent.
    expect(await approveWithinTolerance(second.run.id)).toBe(0);
  });

  test('a real change stays for the reviewer; a project tolerance can take it', async ({ db, tenant }) => {
    const before = await page();
    const after = await page([{ x: 0, y: 0, width: 2, height: 2 }]);
    const first = await runWith(tenant, { desktop: before, mobile: before }, t0);
    await uploadAll(db, first, { desktop: before, mobile: before });
    const firstCaps = await captures(first.run.id, t0);
    await decide({ projectId: tenant.project.id, captureIds: [firstCaps.desktop.id, firstCaps.mobile.id], decision: 'approved', userId: tenant.adminUser.id });
    const second = await runWith(tenant, { desktop: after, mobile: after }, t1);
    await uploadAll(db, second, { desktop: after, mobile: after });
    await measurePlan(second.run.id);
    expect(await approveWithinTolerance(second.run.id)).toBe(0);

    await db.update(projects).set({ settings: { visualDiff: { maxChangedPixels: 10 } } }).where(eq(projects.id, tenant.project.id));
    expect(await approveWithinTolerance(second.run.id)).toBe(2);

    await db.update(projects).set({ settings: { visualDiff: { autoApprove: false, maxChangedPixels: 10 } } }).where(eq(projects.id, tenant.project.id));
    const third = await runWith(tenant, { desktop: await page([{ x: 50, y: 50, width: 1, height: 1 }]), mobile: before }, new Date());
    await uploadAll(db, third, { desktop: await page([{ x: 50, y: 50, width: 1, height: 1 }]), mobile: before });
    await measurePlan(third.run.id);
    expect(await approveWithinTolerance(third.run.id)).toBe(0);
    const decisions = await db.select().from(reviewDecisions).where(eq(reviewDecisions.source, 'tolerance'));
    expect(decisions).toHaveLength(2);
  });
});

describe('capture lookup', () => {
  test('a single capture carries its diff against the run before', async ({ db, tenant }) => {
    const before = { desktop: await page(), mobile: await page() };
    const first = await runWith(tenant, before, t0);
    await uploadAll(db, first, before);
    const after = { desktop: await page([{ x: 5, y: 5, width: 3, height: 3 }]), mobile: before.mobile };
    const second = await runWith(tenant, after, t1);
    await uploadAll(db, second, after);
    await measurePlan(second.run.id);
    const [capture] = await db.select().from(reviewCaptures).where(eq(reviewCaptures.attachmentId, second.desktop.id));
    const found = await captureInProject(tenant.project.id, capture.id);
    expect(found!.capture).toMatchObject({ diffAgainst: 'previous', diff: { status: 'done', changedPixels: 9 } });
  });
});

describe('sweep', () => {
  test('drops comparisons whose images are gone, with their overlays', async ({ db, tenant }) => {
    const before = { desktop: await page(), mobile: await page() };
    const first = await runWith(tenant, before, t0);
    await uploadAll(db, first, before);
    const after = { desktop: await page([{ x: 5, y: 5, width: 3, height: 3 }]), mobile: before.mobile };
    const second = await runWith(tenant, after, t1);
    await uploadAll(db, second, after);
    await measurePlan(second.run.id);
    const [diff] = await db.select().from(imageDiffs);
    expect(await sweepDiffs()).toBe(0);

    await db.update(attachments).set({ status: 'expired', expiredAt: new Date() }).where(eq(attachments.id, second.desktop.id));
    expect(await sweepDiffs()).toBe(1);
    expect(await db.select().from(imageDiffs)).toHaveLength(0);
    expect(await getStorage().head(diff.overlayKey!)).toBeNull();
  });
});

describe('comparing a run with another run', () => {
  test('measures what changed since that run, not since the approved baseline', async ({ db, tenant }) => {
    const a = { x: 10, y: 10, width: 10, height: 4 };
    const b = { x: 60, y: 50, width: 5, height: 5 };
    const first = { desktop: await page(), mobile: await page() };
    const r1 = await runWith(tenant, first, t0);
    await uploadAll(db, r1, first);
    await decide({ projectId: tenant.project.id, captureIds: [(await captures(r1.run.id, t0)).desktop.id], decision: 'approved', userId: tenant.adminUser.id });
    const second = { desktop: await page([a]), mobile: first.mobile };
    const r2 = await runWith(tenant, second, t1);
    await uploadAll(db, r2, second);
    const t2 = new Date(Date.now() - 600_000);
    // Mobile: the same picture, encoded anew — other bytes, as a run on another machine produces them.
    const third = { desktop: await page([a, b]), mobile: await page([], { compression: 1 }) };
    expect(sha(third.mobile)).not.toBe(sha(first.mobile));
    const r3 = await runWith(tenant, third, t2);
    await uploadAll(db, r3, third);

    const records = await runReview({ id: r3.run.id, startedAt: t2 });
    const mine = records[0].checkpoints[0].captures;
    const desktop = mine.find((c) => c.variant === 'desktop')!;
    // By default the desktop image is compared with the approved one: both boxes.
    expect(desktop).toMatchObject({ status: 'changed', diffAgainst: 'baseline' });

    // Plan the pairs the run comparison asks for (the diff driver is off in tests): until they are measured, they are measuring.
    const settings = (await diffSettingsFor([tenant.project.id])).get(tenant.project.id)!;
    const plan = await planPairs(mine.map((c) => ({ pair: pairOf(c, c.previous!.capture, settings, c.ignoreRegions)!, head: c.attachment, base: c.previous!.capture.attachment })));
    const before = (await compareRunRecords(tenant.project.id, records, 'previous'))!;
    expect(mine.map((c) => before.entries.get(c.id)!.status)).toEqual(['measuring', 'measuring']);
    for (const id of plan.ids) expect(await measureDiff(id)).toBe('done');

    const compared = (await compareRunRecords(tenant.project.id, records, 'previous'))!;
    const byVariant = Object.fromEntries(mine.map((c) => [c.variant, compared.entries.get(c.id)!]));
    // Since the run before only the second box appeared.
    expect(byVariant.desktop).toMatchObject({ status: 'changed', reference: { runNumber: r2.run.number }, measured: { same: false, pending: false } });
    expect(byVariant.desktop.measured!.diff).toMatchObject({ status: 'done', changedPixels: 25, regions: [{ ...b, pixels: 25 }] });
    // Mobile: other bytes, measured without one changed pixel — unchanged, not a change.
    expect(byVariant.mobile).toMatchObject({ status: 'unchanged', reference: { runNumber: r2.run.number }, measured: { same: false, pending: false } });
    expect(byVariant.mobile.measured!.diff).toMatchObject({ status: 'done', changedPixels: 0 });

    // Against run #first, by number: both boxes, as the approved image happens to be that run's.
    const sinceFirst = (await compareRunRecords(tenant.project.id, records, `run:${r1.run.number}`))!;
    expect(sinceFirst.runNumber).toBe(r1.run.number);
    expect(sinceFirst.entries.get(desktop.id)).toMatchObject({ status: 'changed', reference: { runNumber: r1.run.number } });
    // Other rules are not run comparisons.
    expect(await compareRunRecords(tenant.project.id, records, 'auto')).toBeNull();
  });
});
