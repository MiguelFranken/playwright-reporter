/**
 * AI analyses of a visual comparison, with the model replaced by a fake: a
 * job is created under the policy and the budget, run once over readable
 * crops, its proposals checked and measured, and a person's acceptance
 * writes a rule revision — never the job itself.
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun, storeUpload } from '@/lib/ingest/service';
import { aiBudgetPeriods, aiUsageLedger, attachments, projects, reviewCaptures, visualAnalysisJobs } from '@/lib/db/schema';
import { AnalysisError, analysisView, createAnalysis, decideSuggestion, proactiveAnalyses, runAnalysis, type ModelCall } from '@/lib/review/analysis/jobs';
import { compare, resolvePair, type Comparison } from '@/lib/review/diff/comparison';
import { rulesOfCapture } from '@/lib/review/diff/ignore';
import { measureDiff, planRun, runCaptures } from '@/lib/review/diff/store';
import { spentThisMonth } from '@/lib/review/analysis/budget';
import { captureInProject, decide } from '@/lib/review/queries';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from './factories';
import { afterEach, beforeEach, describe, expect, test, type Db, type Tenant } from './fixtures';
import { call, createPat, mcpClient } from './mcp/client';

const KEY = 'tests/booking.spec.ts::books a workshop';

type Box = { x: number; y: number; width: number; height: number };

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

async function runWith(db: Db, tenant: Tenant, image: Buffer, startedAt: Date) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString() }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const ref = attachmentRef({ name: 'review:summary:desktop', size: image.length });
  const checkpoints: Checkpoint[] = [{ name: 'summary', title: 'Booking summary', sequence: 0, stepPath: ['Checkout'], variants: [{ variant: 'desktop', attachmentId: ref.id, sha256: createHash('sha256').update(image).digest('hex'), width: 240, height: 160, deviceScaleFactor: 1 }] }];
  await ingestEvents(tenant.tokenProject, run, eventBatch([testBegin({ seq: 0, testKey: KEY, title: 'books a workshop', file: 'tests/booking.spec.ts' }), attemptEnd({ seq: 1, testKey: KEY, startedAt: startedAt.toISOString(), attachments: [ref], checkpoints })]));
  const [row] = await db.select().from(attachments).where(eq(attachments.id, ref.id));
  await storeUpload(row, new Response(new Uint8Array(image)).body, 'image/png');
  const [capture] = await db.select().from(reviewCaptures).where(eq(reviewCaptures.attachmentId, ref.id));
  return { run, number: started.runNumber, capture };
}

const t0 = new Date(Date.now() - 3_600_000);
const t1 = new Date(Date.now() - 1_800_000);

/** A model that calls the name dynamic and proposes a box around it, in thousandths of the head crop it was shown. */
const fakeModel = (opts: { box?: { x0: number; y0: number; x1: number; y1: number }; recommendation?: 'consider_ignore' | 'investigate' } = {}): ModelCall & { calls: { images: number; text: string }[] } => {
  const calls: { images: number; text: string }[] = [];
  const fn: ModelCall = async ({ messages }) => {
    const content = messages[0].content as { type: string; text?: string }[];
    calls.push({ images: content.filter((p) => p.type === 'image').length, text: content.filter((p) => p.type === 'text').map((p) => p.text).join('\n') });
    const regionId = /id (r[\d-]+)/.exec(calls[0].text)?.[1] ?? 'D1';
    return {
      output: {
        summary: 'The booking name differs between the runs; everything else is the same.',
        regions: [
          {
            regionId,
            observation: 'A different name at the same place; the row and the price beside it are unchanged.',
            hypothesis: 'dynamic_text',
            alternatives: ['Another test user', 'A sort order'],
            recommendation: opts.recommendation ?? 'consider_ignore',
            uncertainty: 'medium',
            dynamicBoxes: opts.box ? [opts.box] : [],
          },
        ],
      },
      usage: { inputTokens: 3000, outputTokens: 200, reasoningTokens: null },
    };
  };
  return Object.assign(fn, { calls });
};

async function comparisonOf(db: Db, tenant: Tenant) {
  const base = await page([{ x: 100, y: 60, width: 60, height: 12 }]);
  const head = await page([{ x: 100, y: 60, width: 90, height: 12 }]);
  const first = await runWith(db, tenant, base, t0);
  const second = await runWith(db, tenant, head, t1);
  const plan = await planRun(second.run.id);
  for (const id of plan.ids) await measureDiff(id);
  const pair = (await resolvePair(tenant.project.id, first.capture.id, second.capture.id))!;
  const [c] = await compare([pair], { plan: true });
  for (const id of (await planRun(second.run.id)).ids) await measureDiff(id);
  const [measured] = await compare([pair]);
  return { first, second, comparison: measured as Comparison & { comparisonId: string; revision: string } };
}

describe('analysis jobs', () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = 'test-key';
    process.env.VISUAL_AI_DRIVER = 'none';
    process.env.IMAGE_DIFF_DRIVER = 'inline';
  });
  afterEach(() => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VISUAL_AI_DRIVER;
    delete process.env.VISUAL_AI_TEAM_MONTHLY_USD;
    process.env.IMAGE_DIFF_DRIVER = 'none';
  });

  test('is refused while the project’s AI mode is off, and by a folder policy', async ({ db, tenant }) => {
    const { comparison } = await comparisonOf(db, tenant);
    const input = { projectId: tenant.project.id, teamId: tenant.team.id, comparison, trigger: 'manual' as const, userId: tenant.adminUser.id };
    await expect(createAnalysis({ ...input, projectSettings: {} })).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    await expect(createAnalysis({ ...input, projectSettings: { visualAi: { mode: 'manual' }, visualPolicies: [{ id: 'p', scope: { kind: 'file', path: 'tests' }, capability: 'ai', effect: 'deny' }] } })).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    delete process.env.AI_GATEWAY_API_KEY;
    await expect(createAnalysis({ ...input, projectSettings: { visualAi: { mode: 'manual' } } })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(await db.select().from(visualAnalysisJobs)).toHaveLength(0);
  });

  test('reserves the cost ceiling, runs once over the crops, stores checked suggestions, settles; the same input is answered, not analysed twice', async ({ db, tenant }) => {
    const { comparison, second } = await comparisonOf(db, tenant);
    const settings = { visualAi: { mode: 'manual', monthlyBudgetMicroUsd: 1_000_000 } };
    await db.update(projects).set({ settings }).where(eq(projects.id, tenant.project.id));
    const { job, created } = await createAnalysis({ projectId: tenant.project.id, teamId: tenant.team.id, projectSettings: settings, comparison, trigger: 'manual', userId: tenant.adminUser.id, idempotencyKey: 'click-1' });
    expect(created).toBe(true);
    expect(job).toMatchObject({ status: 'queued', model: 'google/gemini-3.8-flash', regionIds: ['r160-60-30-12'] });
    expect(job.reservedMicroUsd).toBeGreaterThan(0);
    expect(await spentThisMonth(tenant.team.id, null)).toBe(job.reservedMicroUsd);
    expect(await spentThisMonth(tenant.team.id, tenant.project.id)).toBe(job.reservedMicroUsd);

    // The name's box in thousandths of the head crop: crop is (136,36) 78×60 with 24 px of padding; the change is x 160–190, y 60–72.
    const model = fakeModel({ box: { x0: 300, y0: 390, x1: 700, y1: 610 } });
    expect(await runAnalysis(job.id, { call: model })).toBe('done');
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].images).toBe(2);
    expect(model.calls[0].text).toContain('Booking summary');
    expect(model.calls[0].text).toContain('id r160-60-30-12');

    const view = (await analysisView(tenant.project.id, job.id))!;
    expect(view.status).toBe('done');
    expect(view.summary).toMatch(/booking name/);
    expect(view.actualMicroUsd).toBeGreaterThan(0);
    expect(view.actualMicroUsd!).toBeLessThanOrEqual(view.reservedMicroUsd);
    expect(view.suggestions).toHaveLength(1);
    const [s] = view.suggestions;
    expect(s).toMatchObject({ regionLabel: 'D1', hypothesis: 'dynamic_text', recommendation: 'consider_ignore', uncertainty: 'medium', decision: 'open' });
    expect(s.proposedRects).toHaveLength(1);
    // Inside the crop and on the change.
    expect(s.proposedRects[0].x).toBeGreaterThanOrEqual(136);
    expect(s.proposedRects[0].x + s.proposedRects[0].width).toBeLessThanOrEqual(214);
    expect(s.effect).toMatchObject({ rawChangedPixels: 360 });
    expect(s.effect!.suppressedPixels).toBeGreaterThan(0);
    // Settled: the reservation is gone, the actual cost is spent, the rest released.
    expect(await spentThisMonth(tenant.team.id, null)).toBe(view.actualMicroUsd);
    const ledger = await db.select().from(aiUsageLedger).where(eq(aiUsageLedger.jobId, job.id));
    expect(ledger.map((l) => l.kind).sort()).toEqual(['release', 'reserve', 'settle']);

    // Same input again: the earlier job, no new reservation.
    const again = await createAnalysis({ projectId: tenant.project.id, teamId: tenant.team.id, projectSettings: settings, comparison, trigger: 'manual', userId: tenant.adminUser.id });
    expect(again).toMatchObject({ created: false, job: { id: job.id } });
    expect(await db.select().from(visualAnalysisJobs)).toHaveLength(1);

    // A person accepts: a rule revision with the suggestion's rectangles, source ai_suggestion; the job wrote nothing itself before.
    expect((await rulesOfCapture(tenant.project.id, second.capture.id))!.revision).toBe(0);
    const decided = await decideSuggestion({ projectId: tenant.project.id, projectSettings: settings, suggestionId: s.id, decision: 'accepted', userId: tenant.adminUser.id, source: 'app' });
    expect(decided.ruleRevision).toBe(1);
    const rules = (await rulesOfCapture(tenant.project.id, second.capture.id))!;
    expect(rules.rules).toHaveLength(1);
    expect(rules.rules[0]).toMatchObject({ source: 'ai_suggestion', analysisId: job.id, category: 'dynamic_text' });
    expect(rules.rules[0].reason).toMatch(/AI suggestion, D1/);
    expect((await analysisView(tenant.project.id, job.id))!.suggestions[0].decision).toBe('accepted');
    await expect(decideSuggestion({ projectId: tenant.project.id, projectSettings: settings, suggestionId: s.id, decision: 'rejected', userId: tenant.adminUser.id, source: 'app' })).rejects.toBeInstanceOf(AnalysisError);
  });

  test('a box over the whole crop is dropped; a failed call keeps the reservation as spent', async ({ db, tenant }) => {
    const { comparison } = await comparisonOf(db, tenant);
    const settings = { visualAi: { mode: 'manual' } };
    await db.update(projects).set({ settings }).where(eq(projects.id, tenant.project.id));
    const { job } = await createAnalysis({ projectId: tenant.project.id, teamId: tenant.team.id, projectSettings: settings, comparison, trigger: 'manual', userId: null });
    expect(await runAnalysis(job.id, { call: fakeModel({ box: { x0: 0, y0: 0, x1: 1000, y1: 1000 } }) })).toBe('done');
    const view = (await analysisView(tenant.project.id, job.id))!;
    expect(view.suggestions[0].proposedRects).toEqual([]);
    expect(view.suggestions[0].effect).toBeNull();

    await db.delete(visualAnalysisJobs);
    await db.delete(aiBudgetPeriods);
    const { job: second } = await createAnalysis({ projectId: tenant.project.id, teamId: tenant.team.id, projectSettings: settings, comparison, trigger: 'manual', userId: null });
    const failing: ModelCall = async () => {
      throw new Error('gateway timeout');
    };
    expect(await runAnalysis(second.id, { call: failing })).toBe('failed');
    expect((await analysisView(tenant.project.id, second.id))!.error).toMatch(/gateway timeout/);
    // Unknown bill: the whole reservation counts as spent.
    expect(await spentThisMonth(tenant.team.id, null)).toBe(second.reservedMicroUsd);
  });

  test('a deny saved after the job was queued stops it before the provider is called', async ({ db, tenant }) => {
    const { comparison } = await comparisonOf(db, tenant);
    const settings = { visualAi: { mode: 'manual' } };
    const { job } = await createAnalysis({ projectId: tenant.project.id, teamId: tenant.team.id, projectSettings: settings, comparison, trigger: 'manual', userId: null });
    const model = fakeModel();
    expect(await runAnalysis(job.id, { call: model })).toBe('denied');
    expect(model.calls).toHaveLength(0);
    expect(await spentThisMonth(tenant.team.id, null)).toBe(0);
  });

  test('the team budget stops a job before any provider is called', async ({ db, tenant }) => {
    process.env.VISUAL_AI_TEAM_MONTHLY_USD = '0.001';
    const { comparison } = await comparisonOf(db, tenant);
    await expect(createAnalysis({ projectId: tenant.project.id, teamId: tenant.team.id, projectSettings: { visualAi: { mode: 'manual' } }, comparison, trigger: 'manual', userId: null })).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
    const [row] = await db.select().from(visualAnalysisJobs);
    expect(row).toMatchObject({ status: 'over_budget', reservedMicroUsd: 0 });
    expect(await spentThisMonth(tenant.team.id, null)).toBe(0);
  });

  test('proactive mode analyses a finished run’s changed screens once, within the cap', async ({ db, tenant }) => {
    const { second } = await comparisonOf(db, tenant);
    await db.update(projects).set({ settings: { visualAi: { mode: 'proactive' } } }).where(eq(projects.id, tenant.project.id));
    process.env.VISUAL_AI_DRIVER = 'inline';
    const model = fakeModel({ recommendation: 'investigate' });
    const first = await proactiveAnalyses(second.run.id, await runCaptures(second.run.id), { call: model });
    expect(first).toEqual({ created: 1, skipped: 0 });
    expect(model.calls).toHaveLength(1);
    const again = await proactiveAnalyses(second.run.id, await runCaptures(second.run.id), { call: model });
    expect(again).toEqual({ created: 0, skipped: 1 });
    expect(model.calls).toHaveLength(1);
    const [job] = await db.select().from(visualAnalysisJobs);
    expect(job).toMatchObject({ trigger: 'proactive', status: 'done' });
  });

  test('through MCP: start with a write token, poll, and decide only when asked', async ({ db, tenant }) => {
    const { comparison, second } = await comparisonOf(db, tenant);
    await db.update(projects).set({ settings: { visualAi: { mode: 'manual' } } }).where(eq(projects.id, tenant.project.id));
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const reader = await mcpClient({ token: (await createPat(tenant.adminUser)).token });
    expect((await reader.listTools()).tools.map((t) => t.name)).not.toContain('analyze_visual_diff');
    const none = await call(reader, 'get_visual_diff_analysis', { project, comparison: comparison.comparisonId });
    expect(none.isError).toBe(true);
    await reader.close();

    const writer = await mcpClient({ token: (await createPat(tenant.adminUser, { scopes: ['read', 'write'] })).token });
    const started = await call(writer, 'analyze_visual_diff', { project, comparison: comparison.comparisonId, idempotencyKey: 'agent-1' });
    expect(started.isError, JSON.stringify(started.structuredContent)).toBeFalsy();
    expect(started.structuredContent).toMatchObject({ status: 'queued', created: true, retryAfterMs: 3000 });
    const analysisId = started.structuredContent!.analysisId as string;
    const same = await call(writer, 'analyze_visual_diff', { project, comparison: comparison.comparisonId, idempotencyKey: 'agent-1' });
    expect(same.structuredContent).toMatchObject({ analysisId, created: false });

    // The worker (here: directly) runs it with the fake model.
    await runAnalysis(analysisId, { call: fakeModel({ box: { x0: 300, y0: 390, x1: 700, y1: 610 } }) });
    const done = await call(writer, 'get_visual_diff_analysis', { project, analysis: analysisId });
    expect(done.structuredContent).toMatchObject({ status: 'done', suggestions: [{ regionLabel: 'D1', decision: 'open' }] });
    const suggestionId = (done.structuredContent!.suggestions as { id: string }[])[0].id;
    const decided = await call(writer, 'decide_visual_suggestion', { project, suggestion: suggestionId, decision: 'accepted', expectedRevision: 0 });
    expect(decided.structuredContent).toMatchObject({ decision: 'accepted', ruleRevision: 1, captureId: second.capture.id });
    expect((await captureInProject(tenant.project.id, second.capture.id))!.capture.ignore.active).toBe(1);
    await writer.close();
  });
});
