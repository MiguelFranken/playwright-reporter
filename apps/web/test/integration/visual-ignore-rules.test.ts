/**
 * Rules that leave areas out of a comparison, with a history: saved under a
 * revision check, drawn on one image and suspended on another size, previewed
 * before saving, read raw and effective, and never letting a tolerance
 * approval made under the old rules stand.
 */
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Checkpoint } from '@miguelfranken/protocol';
import { saveIgnoreRegions } from '@/app/(app)/teams/[team]/projects/[project]/review/actions';
import { getRunForProject, ingestEvents, startRun, storeUpload } from '@/lib/ingest/service';
import { attachments, projects, reviewCaptures, reviewDecisions, reviewIgnoreRegions, reviewIgnoreRevisions } from '@/lib/db/schema';
import { approveWithinTolerance, measureDiff, planRun } from '@/lib/review/diff/store';
import { previewRules, rulesOfCapture, setRules, IgnoreRevisionConflict } from '@/lib/review/diff/ignore';
import { captureInProject, decide, runReview, runReviewCounts } from '@/lib/review/queries';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from './factories';
import { afterEach, beforeEach, createMember, describe, expect, test, type Db, type Tenant } from './fixtures';
import { call, createPat, mcpClient } from './mcp/client';

const KEY = 'tests/booking.spec.ts::books a workshop';

type Box = { x: number; y: number; width: number; height: number };

async function page(boxes: Box[] = [], width = 200, height = 150) {
  const data = Buffer.alloc(width * height * 4, 255);
  for (const b of boxes)
    for (let y = b.y; y < b.y + b.height; y++)
      for (let x = b.x; x < b.x + b.width; x++) {
        const p = (y * width + x) * 4;
        data[p] = data[p + 1] = data[p + 2] = 0;
      }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function runWith(db: Db, tenant: Tenant, image: Buffer, startedAt: Date, size = { width: 200, height: 150 }) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const ref = attachmentRef({ name: 'review:summary:desktop', size: image.length });
  const checkpoints: Checkpoint[] = [{ name: 'summary', title: 'Booking summary', sequence: 0, stepPath: [], variants: [{ variant: 'desktop', attachmentId: ref.id, sha256: createHash('sha256').update(image).digest('hex'), ...size }] }];
  await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: KEY, title: 'books a workshop', file: 'tests/booking.spec.ts' }), attemptEnd({ seq: 1, testKey: KEY, startedAt: startedAt.toISOString(), attachments: [ref], checkpoints })]));
  const [row] = await db.select().from(attachments).where(eq(attachments.id, ref.id));
  await storeUpload(row, new Response(new Uint8Array(image)).body, 'image/png');
  const [capture] = await db.select().from(reviewCaptures).where(eq(reviewCaptures.attachmentId, ref.id));
  return { run, number: started.runNumber, capture };
}

async function measureAll(runId: string) {
  const plan = await planRun(runId);
  for (const id of plan.ids) await measureDiff(id);
}

const t0 = new Date(Date.now() - 3_600_000);
const t1 = new Date(Date.now() - 1_800_000);
const t2 = new Date(Date.now() - 600_000);

describe('rule sets', () => {
  test('saving keeps rule ids and reasons, counts revisions, writes the history and refuses a stale revision', async ({ db, tenant, actor }) => {
    const { capture } = await runWith(db, tenant, await page(), t0);
    const ref = { team: tenant.team.slug, project: tenant.project.slug };
    actor.signIn(tenant.adminUser);
    const first = await saveIgnoreRegions(ref, { captureId: capture.id, regions: [{ x: 10, y: 10, width: 40, height: 10, reason: 'The booking name is random.' }], reason: 'first rule' });
    expect(first).toMatchObject({ ok: true, revision: 1 });
    const set = (await rulesOfCapture(tenant.project.id, capture.id))!;
    expect(set.revision).toBe(1);
    expect(set.rules).toHaveLength(1);
    expect(set.rules[0]).toMatchObject({ reason: 'The booking name is random.', source: 'manual', active: true, geometry: { imageWidth: 200, imageHeight: 150, originCaptureId: capture.id } });
    const ruleId = set.rules[0].id;

    // Keeping the rule by id and adding one: the first keeps its reason and id.
    const second = await saveIgnoreRegions(ref, { captureId: capture.id, regions: [{ id: ruleId, x: 10, y: 10, width: 40, height: 10 }, { x: 100, y: 100, width: 20, height: 20, category: 'time_dependent' }], expectedRevision: 1 });
    expect(second).toMatchObject({ ok: true, revision: 2 });
    const after = (await rulesOfCapture(tenant.project.id, capture.id))!;
    expect(after.rules.map((r) => r.id)).toContain(ruleId);
    expect(after.rules.find((r) => r.id === ruleId)).toMatchObject({ reason: 'The booking name is random.' });
    expect(after.rules.find((r) => r.id !== ruleId)).toMatchObject({ category: 'time_dependent' });
    // The active rectangles are written beside the rules, for the engine.
    const [row] = await db.select().from(reviewIgnoreRegions);
    expect(row.regions).toHaveLength(2);
    expect(row.revision).toBe(2);
    expect(await db.select().from(reviewIgnoreRevisions)).toHaveLength(2);

    // Somebody else saved since: refused, nothing changed.
    const stale = await saveIgnoreRegions(ref, { captureId: capture.id, regions: [], expectedRevision: 1 });
    expect(stale).toMatchObject({ ok: false, message: expect.stringMatching(/changed since/) });
    expect((await rulesOfCapture(tenant.project.id, capture.id))!.revision).toBe(2);
    await expect(setRules({ projectId: tenant.project.id, capture, rules: [], expectedRevision: 1, source: 'api', userId: null })).rejects.toBeInstanceOf(IgnoreRevisionConflict);

    // Switching a rule off keeps it, findable, out of the engine's rectangles.
    const off = await saveIgnoreRegions(ref, { captureId: capture.id, regions: [{ id: ruleId, x: 10, y: 10, width: 40, height: 10, active: false }], expectedRevision: 2 });
    expect(off).toMatchObject({ ok: true, revision: 3 });
    const [row3] = await db.select().from(reviewIgnoreRegions);
    expect(row3.regions).toEqual([]);
    expect(row3.rules).toHaveLength(1);
    const found = await captureInProject(tenant.project.id, capture.id);
    expect(found!.capture.ignore).toMatchObject({ active: 0, ever: true, applied: 0, revision: 3 });

    // Viewers may not.
    actor.signIn(await createMember(db, tenant.team.id, 'viewer'));
    expect(await saveIgnoreRegions(ref, { captureId: capture.id, regions: [] })).toMatchObject({ ok: false });
  });

  test('a rule drawn on one image size is suspended on another, and a legacy row still applies', async ({ db, tenant }) => {
    const first = await runWith(db, tenant, await page(), t0);
    await setRules({ projectId: tenant.project.id, capture: first.capture, rules: [{ x: 0, y: 0, width: 20, height: 20 }], source: 'api', userId: null });
    const same = await runWith(db, tenant, await page([{ x: 2, y: 2, width: 8, height: 8 }]), t1);
    const taller = await runWith(db, tenant, await page([{ x: 2, y: 2, width: 8, height: 8 }], 200, 180), t2, { width: 200, height: 180 });
    const sameCap = (await captureInProject(tenant.project.id, same.capture.id))!.capture;
    const tallCap = (await captureInProject(tenant.project.id, taller.capture.id))!.capture;
    expect(sameCap.ignore).toMatchObject({ applied: 1, suspended: 0 });
    expect(sameCap.ignoreRegions).toEqual([{ x: 0, y: 0, width: 20, height: 20 }]);
    expect(tallCap.ignore).toMatchObject({ applied: 0, suspended: 1 });
    expect(tallCap.ignore.suspendedRules[0].validity).toBe('geometry_changed');
    expect(tallCap.ignoreRegions).toEqual([]);

    // A row saved before rules had a history: one legacy rule per rectangle, applied on any size.
    await db.update(reviewIgnoreRegions).set({ rules: null });
    const legacy = (await captureInProject(tenant.project.id, taller.capture.id))!.capture;
    expect(legacy.ignore.rules[0]).toMatchObject({ id: 'legacy-1', source: 'legacy', geometry: null });
    expect(legacy.ignoreRegions).toHaveLength(1);
  });

  test('raw and effective are measured apart; a tolerance approval under the old rules is reviewed again', async ({ db, tenant }) => {
    const before = await page();
    const first = await runWith(db, tenant, before, t0);
    await decide({ projectId: tenant.project.id, captureIds: [first.capture.id], decision: 'approved', userId: tenant.adminUser.id });
    const second = await runWith(db, tenant, await page([{ x: 2, y: 2, width: 8, height: 8 }]), t1);
    await setRules({ projectId: tenant.project.id, capture: second.capture, rules: [{ x: 0, y: 0, width: 20, height: 20, reason: 'clock' }], source: 'api', userId: null });
    await measureAll(second.run.id);
    let cap = (await captureInProject(tenant.project.id, second.capture.id))!.capture;
    expect(cap.diff).toMatchObject({ status: 'done', changedPixels: 0 });
    expect(cap.rawDiff).toMatchObject({ status: 'done', changedPixels: 64 });
    expect(cap.ignore).toMatchObject({ rawChangedPixels: 64, suppressedPixels: 64, applied: 1, revision: 1 });
    expect(cap.withinTolerance).toBe(true);

    // The default tolerance approves "no visible change"; the approval records what it rested on.
    expect(await approveWithinTolerance(second.run.id)).toBe(1);
    cap = (await captureInProject(tenant.project.id, second.capture.id))!.capture;
    expect(cap.status).toBe('approved');
    expect(cap.decision).toMatchObject({ source: 'tolerance', provenance: { ignoreRevision: 1 } });
    expect((await runReviewCounts([second.run.id]))[second.run.id]).toMatchObject({ approved: 1 });

    // The rule goes: the approval no longer holds, the image is changed again, the decision stays as history.
    await setRules({ projectId: tenant.project.id, capture: second.capture, rules: [], expectedRevision: 1, source: 'api', userId: null, reason: 'the clock is frozen in the test now' });
    cap = (await captureInProject(tenant.project.id, second.capture.id))!.capture;
    expect(cap.status).toBe('changed');
    expect(cap.decision).toBeNull();
    expect(cap.staleTolerance).toMatchObject({ source: 'tolerance' });
    expect(await db.select().from(reviewDecisions).where(eq(reviewDecisions.source, 'tolerance'))).toHaveLength(1);
    expect((await runReviewCounts([second.run.id]))[second.run.id]).toMatchObject({ changed: 1 });
    // A person's approval is never made stale by a rule change.
    await decide({ projectId: tenant.project.id, captureIds: [second.capture.id], decision: 'approved', userId: tenant.adminUser.id });
    await setRules({ projectId: tenant.project.id, capture: second.capture, rules: [{ x: 0, y: 0, width: 20, height: 20 }], source: 'api', userId: null });
    expect((await captureInProject(tenant.project.id, second.capture.id))!.capture.status).toBe('approved');
  });

  test('a preview measures what rectangles would do, saving nothing', async ({ db, tenant }) => {
    const base = await page([{ x: 100, y: 60, width: 60, height: 12 }]);
    const head = await page([{ x: 100, y: 60, width: 90, height: 12 }, { x: 10, y: 120, width: 5, height: 5 }]);
    const preview = await previewRules(base, head, [{ x: 150, y: 55, width: 50, height: 22 }], 0.1);
    expect(preview).toMatchObject({ rawChangedPixels: 360 + 25, suppressedPixels: 360, effectiveChangedPixels: 25, ignoredAreaPixels: 1100, remainingRegions: 1, sizeChanged: false });
    expect(preview.regions.map((r) => r.covered).sort()).toEqual(['full', 'none']);
    void db;
    void tenant;
  });
});

describe('through MCP', () => {
  beforeEach(() => {
    process.env.IMAGE_DIFF_DRIVER = 'inline';
  });
  afterEach(() => {
    process.env.IMAGE_DIFF_DRIVER = 'none';
  });

  test('lists, previews, sets under a revision check, respects the policy and the scope', async ({ db, tenant }) => {
    const base = await page([{ x: 100, y: 60, width: 60, height: 12 }]);
    const head = await page([{ x: 100, y: 60, width: 90, height: 12 }]);
    const first = await runWith(db, tenant, base, t0);
    const second = await runWith(db, tenant, head, t1);
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const reader = await mcpClient({ token: (await createPat(tenant.adminUser)).token });
    expect((await reader.listTools()).tools.map((t) => t.name)).not.toContain('set_visual_ignore_rules');
    const listed = await call(reader, 'list_visual_diffs', { project, headRun: second.number, baseRun: first.number });
    const comparisonId = (listed.structuredContent!.comparisons as { comparisonId: string }[])[0].comparisonId;

    const preview = await call(reader, 'preview_visual_ignore_rules', { project, comparison: comparisonId, rules: [{ x: 150, y: 55, width: 50, height: 22 }] });
    expect(preview.isError, JSON.stringify(preview.structuredContent)).toBeFalsy();
    expect(preview.structuredContent).toMatchObject({ rawChangedPixels: 360, suppressedPixels: 360, remainingPixels: 0, remainingRegions: 0 });
    expect(await db.select().from(reviewIgnoreRegions)).toHaveLength(0);

    const empty = await call(reader, 'list_visual_ignore_rules', { project });
    expect(empty.structuredContent).toMatchObject({ counts: { sets: 0 } });
    await reader.close();

    const writer = await mcpClient({ token: (await createPat(tenant.adminUser, { scopes: ['read', 'write'] })).token });
    const set = await call(writer, 'set_visual_ignore_rules', { project, capture: second.capture.id, expectedRevision: 0, rules: [{ x: 150, y: 55, width: 50, height: 22, reason: 'random booking name', category: 'dynamic_text' }], reason: 'agent proposal accepted by Ada' });
    expect(set.isError, JSON.stringify(set.structuredContent)).toBeFalsy();
    expect(set.structuredContent).toMatchObject({ revision: 1, remeasured: true, rules: [{ reason: 'random booking name', category: 'dynamic_text', source: 'manual', validity: 'valid' }] });
    const conflict = await call(writer, 'set_visual_ignore_rules', { project, capture: second.capture.id, expectedRevision: 0, rules: [] });
    expect((conflict.structuredContent as { error: { code: string } }).error.code).toBe('REVISION_CONFLICT');

    const one = await call(writer, 'list_visual_ignore_rules', { project, capture: second.capture.id });
    expect(one.structuredContent).toMatchObject({ sets: [{ revision: 1, rules: [{ validity: 'valid' }], history: [{ revision: 1, source: 'mcp', reason: 'agent proposal accepted by Ada' }], states: expect.arrayContaining(['active', 'applied']) }] });

    // The measurement now says: raw 360, effective 0.
    const detail = await call(writer, 'get_visual_diff', { project, comparison: comparisonId });
    expect(detail.structuredContent).toMatchObject({ rawChangedPixels: 360, effectiveChangedPixels: 0, ignoreRuleRevision: 1 });

    // A policy denies rules for this spec folder: refused, with the reason.
    await db.update(projects).set({ settings: { visualPolicies: [{ id: 'p1', scope: { kind: 'file', path: 'tests' }, capability: 'ignore', effect: 'deny' }] } }).where(eq(projects.id, tenant.project.id));
    const denied = await call(writer, 'set_visual_ignore_rules', { project, capture: second.capture.id, expectedRevision: 1, rules: [] });
    expect((denied.structuredContent as { error: { code: string } }).error.code).toBe('POLICY_DENIED');
    await writer.close();
  });
});
