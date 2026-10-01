/**
 * The image diff workflow on a real Workflow SDK runtime (in-process local
 * world) against a real database and attachment store: a finished run is
 * planned, each changed image measured in its own step, and the noise the
 * project tolerates approved.
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { start } from 'workflow/api';
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun, storeUpload } from '@/lib/ingest/service';
import { attachments, imageDiffs } from '@/lib/db/schema';
import { decide, runReview } from '@/lib/review/queries';
import { diffPairs, diffRun } from '@/lib/review/diff/workflow/diff.workflow';
import { planRun } from '@/lib/review/diff/store';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from '../integration/factories';
import { describe, expect, test, type Db, type Tenant } from '../integration/fixtures';

const KEY = 'tests/shop.spec.ts::checks out';

async function page(dot?: { x: number; y: number }, compression = 6) {
  const width = 80;
  const height = 60;
  const data = Buffer.alloc(width * height * 4, 255);
  if (dot) data.fill(0, (dot.y * width + dot.x) * 4, (dot.y * width + dot.x) * 4 + 3);
  return sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: compression }).toBuffer();
}

async function runWith(db: Db, tenant: Tenant, image: Buffer, startedAt: Date) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const ref = attachmentRef({ name: 'review:cart:desktop', size: image.length });
  const checkpoints: Checkpoint[] = [{ name: 'cart', sequence: 0, stepPath: [], variants: [{ variant: 'desktop', attachmentId: ref.id, sha256: createHash('sha256').update(image).digest('hex') }] }];
  await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: KEY }), attemptEnd({ seq: 1, testKey: KEY, startedAt: startedAt.toISOString(), attachments: [ref], checkpoints })]));
  const [row] = await db.select().from(attachments).where(eq(attachments.id, ref.id));
  await storeUpload(row, new Response(new Uint8Array(image)).body, 'image/png');
  return run;
}

const capture = async (runId: string, startedAt: Date) => (await runReview({ id: runId, startedAt }))[0].checkpoints[0].captures[0];

describe('diffRun', () => {
  test('measures a finished run and approves what only changed its encoding', async ({ db, tenant }) => {
    const t0 = new Date(Date.now() - 60_000);
    const first = await runWith(db, tenant, await page({ x: 3, y: 3 }), t0);
    await decide({ projectId: tenant.project.id, captureIds: [(await capture(first.id, t0)).id], decision: 'approved', userId: tenant.adminUser.id });

    const t1 = new Date();
    const second = await runWith(db, tenant, await page({ x: 3, y: 3 }, 1), t1);
    const run = await start(diffRun, [second.id]);
    expect(await run.returnValue).toEqual({ runId: second.id, measured: 1, approved: 1, analyses: 0 });
    expect(await capture(second.id, t1)).toMatchObject({ status: 'approved', decision: { source: 'tolerance' }, diff: { status: 'done', changedPixels: 0 } });
  });
});

describe('diffPairs', () => {
  test('measures planned pairs and leaves a real change for the reviewer', async ({ db, tenant }) => {
    const t0 = new Date(Date.now() - 60_000);
    const first = await runWith(db, tenant, await page(), t0);
    await decide({ projectId: tenant.project.id, captureIds: [(await capture(first.id, t0)).id], decision: 'approved', userId: tenant.adminUser.id });
    const t1 = new Date();
    const second = await runWith(db, tenant, await page({ x: 10, y: 10 }), t1);
    const plan = await planRun(second.id);
    const run = await start(diffPairs, [plan.ids, second.id]);
    expect(await run.returnValue).toEqual({ runId: second.id, measured: 1, approved: 0 });
    const [row] = await db.select().from(imageDiffs);
    expect(row).toMatchObject({ status: 'done', changedPixels: 1, regions: [{ x: 10, y: 10, width: 1, height: 1, pixels: 1 }] });
    expect((await capture(second.id, t1)).status).toBe('changed');
  });
});
