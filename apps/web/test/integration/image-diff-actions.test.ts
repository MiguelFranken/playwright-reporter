/**
 * What people and agents do with measured comparisons: set a project's
 * tolerance, leave areas of a checkpoint out, and read the measurement (with
 * close-ups of the changes) through the MCP tools.
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Checkpoint } from '@miguelfranken/protocol';
import { saveIgnoreRegions } from '@/app/(app)/teams/[team]/projects/[project]/review/actions';
import { updateVisualDiff } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';
import { getRunForProject, ingestEvents, startRun, storeUpload } from '@/lib/ingest/service';
import { attachments, projects, reviewCaptures, reviewIgnoreRegions } from '@/lib/db/schema';
import { measureDiff, planRun } from '@/lib/review/diff/store';
import { visualDiffSettings } from '@/lib/review/diff/settings';
import { decide } from '@/lib/review/queries';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from './factories';
import { createMember, describe, expect, test, type Db, type Tenant } from './fixtures';
import { call, createPat, mcpClient } from './mcp/client';

const KEY = 'tests/checkout.spec.ts::places an order';

async function page(box?: { x: number; y: number; width: number; height: number }) {
  const width = 200;
  const height = 150;
  const data = Buffer.alloc(width * height * 4, 255);
  if (box) for (let y = box.y; y < box.y + box.height; y++) data.fill(0, (y * width + box.x) * 4, (y * width + box.x + box.width) * 4);
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function runWith(db: Db, tenant: Tenant, image: Buffer, startedAt: Date) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const ref = attachmentRef({ name: 'review:checkout-ready:desktop', size: image.length });
  const checkpoints: Checkpoint[] = [
    { name: 'checkout-ready', title: 'Checkout filled in', sequence: 0, stepPath: [], variants: [{ variant: 'desktop', attachmentId: ref.id, sha256: createHash('sha256').update(image).digest('hex'), width: 200, height: 150 }] },
  ];
  await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: KEY, title: 'places an order', file: 'tests/checkout.spec.ts' }), attemptEnd({ seq: 1, testKey: KEY, startedAt: startedAt.toISOString(), attachments: [ref], checkpoints })]));
  const [row] = await db.select().from(attachments).where(eq(attachments.id, ref.id));
  await storeUpload(row, new Response(new Uint8Array(image)).body, 'image/png');
  const [capture] = await db.select().from(reviewCaptures).where(eq(reviewCaptures.attachmentId, ref.id));
  return { run, number: started.runNumber, capture };
}

function settingsForm(team: string, project: string, fields: Record<string, string>) {
  const data = new FormData();
  data.set('team', team);
  data.set('project', project);
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

describe('updateVisualDiff', () => {
  test('saves the tolerance and keeps the other settings', async ({ db, tenant, actor }) => {
    await db.update(projects).set({ settings: { defaultBranch: 'develop' } }).where(eq(projects.id, tenant.project.id));
    actor.signIn(tenant.adminUser);
    const result = await updateVisualDiff(null, settingsForm(tenant.team.slug, tenant.project.slug, { threshold: '0.2', maxChangedPixels: '25', maxChangedPercent: '0.5' }));
    expect(result).toMatchObject({ ok: true });
    const [row] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, tenant.project.id));
    expect(row.settings.defaultBranch).toBe('develop');
    // The checkbox was not sent: automatic approval is off.
    expect(visualDiffSettings(row.settings)).toEqual({ threshold: 0.2, autoApprove: false, maxChangedPixels: 25, maxChangedPercent: 0.5 });
  });

  test('refuses values out of range, and viewers', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await updateVisualDiff(null, settingsForm(tenant.team.slug, tenant.project.slug, { threshold: '0.9' }))).toMatchObject({ ok: false, message: expect.stringMatching(/threshold/) });
    expect(await updateVisualDiff(null, settingsForm(tenant.team.slug, tenant.project.slug, { threshold: '0.1', maxChangedPixels: '1.5' }))).toMatchObject({ ok: false });
    actor.signIn(await createMember(db, tenant.team.id, 'viewer'));
    expect(await updateVisualDiff(null, settingsForm(tenant.team.slug, tenant.project.slug, { threshold: '0.1', autoApprove: 'on' }))).toMatchObject({ ok: false });
  });
});

describe('saveIgnoreRegions', () => {
  test('saves the areas per checkpoint and variant; refuses bad ones and viewers', async ({ db, tenant, actor }) => {
    const { capture } = await runWith(db, tenant, await page(), new Date());
    const ref = { team: tenant.team.slug, project: tenant.project.slug };
    actor.signIn(tenant.adminUser);
    expect(await saveIgnoreRegions(ref, { captureId: capture.id, regions: [{ x: 1.4, y: 2, width: 30, height: 10 }] })).toEqual({ ok: true, revision: 1 });
    const [row] = await db.select().from(reviewIgnoreRegions);
    expect(row).toMatchObject({ testId: capture.testId, checkpointName: 'checkout-ready', variant: 'desktop', regions: [{ x: 1, y: 2, width: 30, height: 10 }], updatedBy: tenant.adminUser.id });
    expect(await saveIgnoreRegions(ref, { captureId: capture.id, regions: [] })).toEqual({ ok: true, revision: 2 });
    expect((await db.select().from(reviewIgnoreRegions))[0].regions).toEqual([]);

    expect(await saveIgnoreRegions(ref, { captureId: capture.id, regions: [{ x: -1, y: 0, width: 5, height: 5 }] })).toMatchObject({ ok: false });
    expect(await saveIgnoreRegions(ref, { captureId: capture.id, regions: 'all' })).toMatchObject({ ok: false });
    actor.signIn(await createMember(db, tenant.team.id, 'viewer'));
    expect(await saveIgnoreRegions(ref, { captureId: capture.id, regions: [] })).toMatchObject({ ok: false });
  });
});

describe('review tools', () => {
  test('report the measured change and attach close-ups of it', async ({ db, tenant }) => {
    const first = await runWith(db, tenant, await page(), new Date(Date.now() - 60_000));
    await decide({ projectId: tenant.project.id, captureIds: [first.capture.id], decision: 'approved', userId: tenant.adminUser.id });
    const second = await runWith(db, tenant, await page({ x: 100, y: 60, width: 20, height: 10 }), new Date());
    for (const id of (await planRun(second.run.id)).ids) await measureDiff(id);

    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token });
    const listed = await call(client, 'list_review_checkpoints', { project, run: second.number });
    expect(listed.structuredContent).toMatchObject({
      tests: [{ checkpoints: [{ captures: [{ captureId: second.capture.id, status: 'changed', autoApproved: false, diff: { against: 'baseline', state: 'done', changedPixels: 200, regions: 1, sizeChanged: false, withinTolerance: false } }] }] }],
    });

    const shown = await call(client, 'get_review_checkpoint', { project, capture: second.capture.id });
    expect(shown.structuredContent).toMatchObject({ changedRegions: [{ x: 100, y: 60, width: 20, height: 10, pixels: 200 }], diff: { changedPercent: expect.closeTo(0.667, 2) } });
    // The image, the baseline, and a close-up of the region from each.
    expect(shown.content.filter((c) => c.type === 'image')).toHaveLength(4);
    const noCrops = await call(client, 'get_review_checkpoint', { project, capture: second.capture.id, changes: false });
    expect(noCrops.content.filter((c) => c.type === 'image')).toHaveLength(2);
    await client.close();
  });
});
