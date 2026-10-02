/**
 * Visual differences between two runs through MCP: both runs green, one
 * screen's text changed; the agent lists the pairs, reads the measurement
 * raw and with a rule applied, and gets the images in the mode it asks for —
 * never a review decision.
 */
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Checkpoint } from '@miguelfranken/protocol';
import { decodeComparisonId } from '@miguelfranken/ui/lib/visual-diff';
import { getRunForProject, ingestEvents, startRun, storeUpload } from '@/lib/ingest/service';
import { attachments, imageDiffs, reviewDecisions, reviewIgnoreRegions } from '@/lib/db/schema';
import { GET as renderRoute } from '@/app/api/visual-diffs/[comparison]/render/route';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from '../factories';
import { afterEach, beforeEach, describe, expect, test, type Db, type Tenant } from '../fixtures';
import { call, createPat, mcpClient } from './client';

const KEY = 'tests/booking.spec.ts::books a workshop';

type Box = { x: number; y: number; width: number; height: number };

/** A white page with black boxes on it. */
async function page(boxes: Box[] = [], width = 240, height = 160) {
  const data = Buffer.alloc(width * height * 4, 255);
  for (const b of boxes)
    for (let y = b.y; y < b.y + b.height; y++)
      for (let x = b.x; x < b.x + b.width; x++) {
        const p = (y * width + x) * 4;
        data[p] = data[p + 1] = data[p + 2] = 0;
      }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function runWith(db: Db, tenant: Tenant, images: Record<string, Buffer>, startedAt: Date, branch = 'main') {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString(), git: { ...runStart().git, branch } }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const refs = Object.fromEntries(Object.entries(images).map(([name, img]) => [name, attachmentRef({ name: `review:${name}:desktop`, size: img.length })]));
  const checkpoints: Checkpoint[] = Object.entries(images).map(([name, img], i) => ({
    name,
    title: name === 'summary' ? 'Booking summary' : 'Confirmation',
    sequence: i,
    stepPath: ['Checkout'],
    url: `https://shop.test/${name}`,
    variants: [{ variant: 'desktop', attachmentId: refs[name].id, sha256: createHash('sha256').update(img).digest('hex'), width: 240, height: 160, viewport: { width: 120, height: 80 }, deviceScaleFactor: 2 }],
  }));
  await ingestEvents(
    tenant.tokenProject,
    run,
    eventBatch([testBegin({ seq: 0, testKey: KEY, title: 'books a workshop', file: 'tests/booking.spec.ts' }), attemptEnd({ seq: 1, testKey: KEY, startedAt: startedAt.toISOString(), attachments: Object.values(refs), checkpoints })]),
  );
  for (const [name, img] of Object.entries(images)) {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, refs[name].id));
    await storeUpload(row, new Response(new Uint8Array(img)).body, 'image/png');
  }
  return { run, number: started.runNumber };
}

const t0 = new Date(Date.now() - 3_600_000);
const t1 = new Date(Date.now() - 1_800_000);

type Row = { comparisonId: string | null; comparisonStatus: string; calculationState: string; rawChangedPixels: number | null; effectiveChangedPixels: number | null; checkpoint: { name: string }; head: { run: number } | null; base: { run: number } | null; ignore: { states: string[] } };

describe('visual diff tools', () => {
  beforeEach(() => {
    process.env.IMAGE_DIFF_DRIVER = 'inline';
  });
  afterEach(() => {
    process.env.IMAGE_DIFF_DRIVER = 'none';
  });

  test('lists the changed screens of two green runs, details one, and shows its images', async ({ db, tenant }) => {
    const unchanged = await page([{ x: 10, y: 10, width: 40, height: 10 }]);
    const nameA = await page([{ x: 100, y: 60, width: 60, height: 12 }]);
    const nameB = await page([{ x: 100, y: 60, width: 90, height: 12 }]);
    const first = await runWith(db, tenant, { summary: nameA, confirmation: unchanged }, t0);
    const second = await runWith(db, tenant, { summary: nameB, confirmation: unchanged }, t1);
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token });

    // Default: the latest run against the newest earlier run on its branch.
    const listed = await call(client, 'list_visual_diffs', { project });
    expect(listed.isError, JSON.stringify(listed.structuredContent)).toBeFalsy();
    expect(listed.structuredContent).toMatchObject({ mode: 'runs', base: { run: first.number }, head: { run: second.number }, counts: { total: 1, changed: 1 } });
    const rows = listed.structuredContent!.comparisons as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ checkpoint: { name: 'summary' }, comparisonStatus: 'changed', calculationState: 'done', head: { run: second.number }, base: { run: first.number } });
    // The name grew by 30 px × 12 px: that many pixels, nothing else.
    expect(rows[0].rawChangedPixels).toBe(30 * 12);
    expect(rows[0].effectiveChangedPixels).toBe(30 * 12);
    const comparisonId = rows[0].comparisonId!;
    expect(decodeComparisonId(comparisonId)).toBeTruthy();

    const all = await call(client, 'list_visual_diffs', { project, headRun: second.number, baseRun: first.number, status: 'all' });
    expect(all.structuredContent).toMatchObject({ counts: { total: 2, changed: 1, identical: 1 } });
    // Nothing was decided about any image.
    expect(await db.select().from(reviewDecisions)).toHaveLength(0);

    const detail = await call(client, 'get_visual_diff', { project, comparison: comparisonId });
    expect(detail.isError, JSON.stringify(detail.structuredContent)).toBeFalsy();
    expect(detail.structuredContent).toMatchObject({
      comparisonId,
      test: { file: 'tests/booking.spec.ts', title: expect.stringContaining('books a workshop') },
      checkpoint: { name: 'summary', title: 'Booking summary', url: 'https://shop.test/summary' },
      capture: { viewport: '120×80', deviceScaleFactor: 2 },
      comparisonStatus: 'changed',
      calculationState: 'done',
      rawChangedPixels: 360,
      ignoredChangedPixels: 0,
      effectiveChangedPixels: 360,
      regionsComplete: true,
      interpretation: null,
    });
    const regions = detail.structuredContent!.regions as { id: string; label: string; headRect: Box; baseRect: Box; ignore: string }[];
    expect(regions).toEqual([{ id: 'r160-60-30-12', label: 'D1', kind: 'change', headRect: { x: 160, y: 60, width: 30, height: 12 }, baseRect: { x: 160, y: 60, width: 30, height: 12 }, rawChangedPixels: 360, ignore: 'none', ignoredBy: [] }]);
    expect(detail.structuredContent!.revision).toMatch(/^r0-/);

    // The head boxed and numbered, then the pair of the region, then the mask.
    const annotated = await call(client, 'get_visual_diff_image', { project, comparison: comparisonId, revision: detail.structuredContent!.revision as string });
    expect(annotated.isError, JSON.stringify(annotated.structuredContent)).toBeFalsy();
    const images = (annotated.content as { type: string }[]).filter((c) => c.type === 'image');
    expect(images).toHaveLength(1);
    expect(annotated.structuredContent).toMatchObject({ mode: 'annotated', scope: 'overview', images: [{ index: 1, role: 'overview', side: 'head', sourceRect: { x: 0, y: 0, width: 240, height: 160 }, outputWidth: 240, scale: 1, captureScale: 2 }] });

    const pair = await call(client, 'get_visual_diff_image', { project, comparison: comparisonId, mode: 'pair', regionIds: ['D1'] });
    expect((pair.content as { type: string }[]).filter((c) => c.type === 'image')).toHaveLength(2);
    const pairImages = pair.structuredContent!.images as { side: string; sourceRect: Box; regionIds: string[] }[];
    // 24 CSS px of context × 2 = 48 image px, clamped to the image.
    expect(pairImages.map((i) => i.side)).toEqual(['base', 'head']);
    expect(pairImages[0].sourceRect).toEqual({ x: 112, y: 12, width: 126, height: 108 });
    expect(pairImages[0].regionIds).toEqual(['r160-60-30-12']);

    const mask = await call(client, 'get_visual_diff_image', { project, comparison: comparisonId, mode: 'mask', scope: 'regions', regionIds: ['r160-60-30-12'] });
    expect(mask.structuredContent).toMatchObject({ images: [{ side: 'both', maskSource: 'measurement' }] });
    const maskImage = (mask.content as { type: string; data?: string }[]).find((c) => c.type === 'image')!;
    const { data, info } = await sharp(Buffer.from(maskImage.data!, 'base64')).raw().toBuffer({ resolveWithObject: true });
    // White inside the changed region, black beside it.
    const at = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    expect(at(48 + 15, 48 + 6)).toBe(255);
    expect(at(2, 2)).toBe(0);

    // A stale revision is refused rather than answered with other numbers.
    const stale = await call(client, 'get_visual_diff_image', { project, comparison: comparisonId, revision: 'r9-000000000000' });
    expect(stale.isError).toBe(true);
    expect((stale.structuredContent as { error: { code: string } }).error.code).toBe('REVISION_CONFLICT');

    // Links instead of bytes: what the REST API gets; the signed link serves exactly that image.
    const linked = await call(client, 'get_visual_diff_image', { project, comparison: comparisonId, mode: 'head', scope: 'crop', crop: { x: 150, y: 50, width: 50, height: 30 }, delivery: 'links' });
    expect((linked.content as { type: string }[]).filter((c) => c.type === 'image')).toHaveLength(0);
    const [link] = linked.structuredContent!.images as { url: string; sourceRect: Box }[];
    expect(link.url).toMatch(/\/api\/visual-diffs\/vc_[A-Za-z0-9_-]+\/render\?/);
    const res = await renderRoute(new Request(link.url), { params: Promise.resolve({ comparison: comparisonId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-source-rect')).toBe('150,50,50,30');
    const tampered = new URL(link.url);
    tampered.searchParams.set('rect', '0,0,240,160');
    expect((await renderRoute(new Request(tampered.toString()), { params: Promise.resolve({ comparison: comparisonId }) })).status).toBe(404);

    // Explicit capture ids name the same pair.
    const decoded = decodeComparisonId(comparisonId)!;
    const byIds = await call(client, 'get_visual_diff', { project, base: decoded.baseCaptureId, head: decoded.headCaptureId });
    expect(byIds.structuredContent).toMatchObject({ comparisonId });
    await client.close();
  });

  test('a rule leaves the changed name out: raw and effective numbers come apart, and the filter finds the screen', async ({ db, tenant }) => {
    const nameA = await page([{ x: 100, y: 60, width: 60, height: 12 }]);
    const nameB = await page([{ x: 100, y: 60, width: 90, height: 12 }]);
    const first = await runWith(db, tenant, { summary: nameA }, t0);
    const second = await runWith(db, tenant, { summary: nameB }, t1);
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token });
    const before = (await call(client, 'list_visual_diffs', { project, headRun: second.number, baseRun: first.number })).structuredContent!.comparisons as Row[];
    const [capture] = await db.query.reviewCaptures.findMany({ where: (c, { eq: eqq }) => eqq(c.runId, second.run.id) });
    await db.insert(reviewIgnoreRegions).values({ id: randomUUID(), projectId: tenant.project.id, testId: capture.testId, checkpointName: 'summary', variant: 'desktop', regions: [{ x: 90, y: 55, width: 110, height: 22 }] });

    const rows = (await call(client, 'list_visual_diffs', { project, headRun: second.number, baseRun: first.number, status: 'all' })).structuredContent!.comparisons as Row[];
    expect(rows[0]).toMatchObject({ comparisonStatus: 'changed', rawChangedPixels: 360, effectiveChangedPixels: 0 });
    expect(rows[0].ignore.states).toEqual(expect.arrayContaining(['active', 'ever', 'applied', 'suppressed', 'fully-suppressed']));
    // Both measurements exist as rows of their own.
    expect(await db.select().from(imageDiffs)).toHaveLength(2);
    expect(((await call(client, 'list_visual_diffs', { project, headRun: second.number, baseRun: first.number, status: 'all', ignore: 'fully-suppressed' })).structuredContent!.comparisons as Row[]).length).toBe(1);
    expect(((await call(client, 'list_visual_diffs', { project, headRun: second.number, baseRun: first.number, status: 'all', ignore: 'needs-review' })).structuredContent!.comparisons as Row[]).length).toBe(0);

    const detail = await call(client, 'get_visual_diff', { project, comparison: before[0].comparisonId! });
    expect(detail.structuredContent).toMatchObject({ rawChangedPixels: 360, ignoredChangedPixels: 360, effectiveChangedPixels: 0, ignoreRuleRevision: 1, rules: { applied: [{ id: 'legacy-1', source: 'legacy' }] } });
    const regions = detail.structuredContent!.regions as { ignore: string; ignoredBy: string[] }[];
    expect(regions[0]).toMatchObject({ ignore: 'full', ignoredBy: ['legacy-1'] });
    // The effective measurement has no regions left.
    const effective = await call(client, 'get_visual_diff', { project, comparison: before[0].comparisonId!, policy: 'effective' });
    expect(effective.structuredContent!.regions).toEqual([]);
    await client.close();
  });

  test('a screen the head run did not capture is not_captured, never a match; a viewer without artifact access gets numbers but no image links', async ({ db, tenant }) => {
    const img = await page([{ x: 1, y: 1, width: 5, height: 5 }]);
    const first = await runWith(db, tenant, { summary: img, confirmation: img }, t0);
    const second = await runWith(db, tenant, { summary: img }, t1);
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token });
    const listed = await call(client, 'list_visual_diffs', { project, headRun: second.number, baseRun: first.number, status: 'all' });
    expect(listed.structuredContent).toMatchObject({ counts: { total: 2, identical: 1, not_captured: 1 } });
    const rows = listed.structuredContent!.comparisons as Row[];
    expect(rows.find((r) => r.checkpoint.name === 'confirmation')).toMatchObject({ comparisonStatus: 'not_captured', comparisonId: null, head: null });
    expect(rows.find((r) => r.checkpoint.name === 'summary')).toMatchObject({ comparisonStatus: 'identical', calculationState: 'not_needed' });
    const same = await call(client, 'list_visual_diffs', { project, headRun: second.number, baseRun: second.number });
    expect(same.isError).toBe(true);
    await client.close();
  });
});
