/**
 * Drawings on review images, on their own: saved under the ids the browser
 * chose, in the image's pixels, shown on the capture drawn on and on every
 * capture with the same pixels, and erased by whoever drew them (or a
 * moderator).
 */
import { randomUUID } from 'node:crypto';
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { runReview } from '@/lib/review/queries';
import { createDrawings, deleteDrawings } from '@/lib/review/drawings';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from './factories';
import { createUserRow, describe, expect, test, type Tenant } from './fixtures';

const KEY = 'tests/checkout.spec.ts::draws on the review';
const sha = (c: string) => c.repeat(64);
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

async function runWith(tenant: Tenant, hash: string, startedAt: Date) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const image = attachmentRef({ name: 'review:ready:desktop' });
  const checkpoints: Checkpoint[] = [
    { name: 'ready', sequence: 0, stepPath: [], variants: [{ variant: 'desktop', attachmentId: image.id, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, width: 2560, height: 4000, sha256: hash }] },
  ];
  await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: KEY }), attemptEnd({ seq: 1, testKey: KEY, startedAt: startedAt.toISOString(), attachments: [image], checkpoints })]));
  const [flow] = await runReview({ id: run.id, startedAt });
  return { run, capture: flow.checkpoints[0].captures[0] };
}

const arrow = { tool: 'arrow' as const, color: 'red' as const, points: [0.1, 0.1, 0.5, 0.25] };
const pen = { tool: 'pen' as const, color: 'blue' as const, points: [0.2, 0.2, 0.25, 0.3, 0.3, 0.2] };

describe('drawings', () => {
  test('saves shapes in the image’s pixels and shows them on the same pixels only', async ({ tenant }) => {
    const { run, capture } = await runWith(tenant, sha('a'), minutesAgo(10));
    const ids = [randomUUID(), randomUUID()];
    const res = await createDrawings({ projectId: tenant.project.id, captureId: capture.id, drawings: [{ id: ids[0], shape: arrow }, { id: ids[1], shape: pen }], userId: tenant.adminUser.id });
    expect(res.created).toBe(2);
    // A retried request saves nothing twice.
    expect((await createDrawings({ projectId: tenant.project.id, captureId: capture.id, drawings: [{ id: ids[0], shape: arrow }], userId: tenant.adminUser.id })).created).toBe(0);

    const [flow] = await runReview({ id: run.id, startedAt: minutesAgo(10) });
    const shown = flow.checkpoints[0].captures[0].drawings;
    expect(shown.map((d) => d.id)).toEqual(ids);
    expect(shown[0].shape).toEqual({ tool: 'arrow', color: 'red', points: [256, 400, 1280, 1000] });
    expect(shown[0].position.points[2]).toBeCloseTo(0.5);
    expect(shown[0].authorName).toBe(tenant.adminUser.name);

    // The same pixels in a later run show them; changed pixels do not.
    expect((await runWith(tenant, sha('a'), minutesAgo(5))).capture.drawings.map((d) => d.id)).toEqual(ids);
    expect((await runWith(tenant, sha('b'), minutesAgo(3))).capture.drawings).toEqual([]);
  });

  test('refuses shapes outside the image, unknown tools, bad ids and other projects’ images', async ({ tenant }) => {
    const { capture } = await runWith(tenant, sha('a'), minutesAgo(5));
    const save = (drawings: { id: string; shape: unknown }[], projectId = tenant.project.id) => createDrawings({ projectId, captureId: capture.id, drawings, userId: tenant.adminUser.id });
    await expect(save([{ id: randomUUID(), shape: { ...arrow, points: [0.1, 0.1, 1.4, 0.2] } }])).rejects.toThrow('outside the image');
    await expect(save([{ id: randomUUID(), shape: { ...arrow, tool: 'eraser' } }])).rejects.toThrow('cannot be saved');
    await expect(save([{ id: 'nope', shape: arrow }])).rejects.toThrow('valid id');
    await expect(save([])).rejects.toThrow('Draw something');
    await expect(save([{ id: randomUUID(), shape: arrow }], randomUUID())).rejects.toThrow('not in this project');
  });

  test('erases its author’s drawings; a moderator erases anyone’s', async ({ tenant, db }) => {
    const { run, capture } = await runWith(tenant, sha('a'), minutesAgo(5));
    const id = randomUUID();
    await createDrawings({ projectId: tenant.project.id, captureId: capture.id, drawings: [{ id, shape: arrow }], userId: tenant.adminUser.id });
    const other = await createUserRow(db);

    await expect(deleteDrawings({ projectId: tenant.project.id, drawingIds: [id], userId: other.id, moderate: false })).rejects.toThrow('Only whoever drew it');
    expect(await deleteDrawings({ projectId: randomUUID(), drawingIds: [id], userId: tenant.adminUser.id, moderate: true })).toEqual({ deleted: 0 });
    expect(await deleteDrawings({ projectId: tenant.project.id, drawingIds: [id], userId: other.id, moderate: true })).toEqual({ deleted: 1 });
    // Erased already: nothing to do, no error.
    expect(await deleteDrawings({ projectId: tenant.project.id, drawingIds: [id], userId: tenant.adminUser.id, moderate: false })).toEqual({ deleted: 0 });

    const [flow] = await runReview({ id: run.id, startedAt: minutesAgo(5) });
    expect(flow.checkpoints[0].captures[0].drawings).toEqual([]);
  });
});
