/**
 * AI analyses of visual comparisons: created under the project's policy and
 * budget, run as one bounded model call over readable crops, their proposals
 * checked geometrically and measured deterministically, and left for a
 * person to accept or reject. A job never changes rules, baselines or
 * approvals by itself; accepting a suggestion writes a rule revision through
 * the same path the editor uses.
 */
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { generateText, Output, createGateway, type ImagePart, type ModelMessage, type TextPart } from 'ai';
import { ANALYSIS_HYPOTHESES, ANALYSIS_RECOMMENDATIONS, type AnalysisStatus, type AnalysisView, type Rect, type VisualDiffRegion } from '@miguelfranken/ui/lib/visual-diff';
import { db } from '@/lib/db/drizzle';
import { projects, visualAnalysisJobs, visualAnalysisSuggestions } from '@/lib/db/schema';
import type { CaptureRecord } from '../queries';
import { compare, contextFor, regionsOf, resolvePair, runInfoFor, type Comparison } from '../diff/comparison';
import { previewRules, rulesOfCapture, setRules } from '../diff/ignore';
import { decidePolicy, policyTargetsFor, visualAiSettings } from '../diff/policy';
import { DEFAULT_CONTEXT_PADDING, loadSource, padRect, render, RenderError, type RenderSource } from '../diff/render';
import { readCaptureBytes } from '../images';
import { BudgetExceeded, reserve, settle, teamMonthlyLimit } from './budget';
import { costCeiling, gatewayKey, modelFor, PRICE_VERSION } from './config';
import { analysisAnswer, introText, MAX_CROPS_PER_ANALYSIS, MAX_OUTPUT_TOKENS, MAX_REGIONS_PER_ANALYSIS, PROMPT_TEXT_TOKENS, PROMPT_VERSION, regionText, SCHEMA_VERSION, SYSTEM_PROMPT, validateBoxes, type AnalysisAnswer } from './prompt';

export class AnalysisError extends Error {
  constructor(
    readonly code: 'POLICY_DENIED' | 'BUDGET_EXCEEDED' | 'UNAVAILABLE' | 'INVALID' | 'NOT_FOUND',
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

/** A job older than this and still running belongs to a worker that died. */
export const JOB_CLAIM_TTL_MS = 5 * 60_000;
/** The most crops a call sends: within `MAX_CROPS_PER_ANALYSIS`, two per region. */
const CROP_MAX_BYTES = 600 * 1024;

export type Driver = 'after' | 'inline' | 'none';

/** `VISUAL_AI_DRIVER`: `after` runs a job once the response is sent (default); `inline` awaits it (tests); `none` leaves it queued. */
export function analysisDriver(env: Record<string, string | undefined> = process.env): Driver {
  const d = env.VISUAL_AI_DRIVER;
  return d === 'inline' || d === 'none' ? d : 'after';
}

export interface CreateInput {
  projectId: string;
  teamId: string;
  projectSettings: Record<string, unknown>;
  comparison: Comparison & { comparisonId: string; revision: string };
  regionIds?: readonly string[];
  purpose?: 'explain' | 'suggest_ignore';
  trigger: 'manual' | 'proactive' | 'mcp';
  userId: string | null;
  idempotencyKey?: string | null;
  /** A lower cap than the project's per-job maximum, when the caller wants one. */
  maxMicroUsd?: number | null;
}

/** What creating a job came to: a job (new or the same input's earlier one), or why none. */
export type CreateOutcome = { job: typeof visualAnalysisJobs.$inferSelect; created: boolean };

function fingerprint(parts: unknown[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

/** The regions a job analyses: the ones asked for, else the largest changes, at most `MAX_REGIONS_PER_ANALYSIS`. */
export function chooseRegions(regions: readonly VisualDiffRegion[], wanted: readonly string[] | undefined): VisualDiffRegion[] {
  const chosen = wanted?.length ? wanted.map((id) => regions.find((r) => r.id === id || r.label === id)).filter((r): r is VisualDiffRegion => Boolean(r)) : [...regions].sort((a, b) => b.rawChangedPixels - a.rawChangedPixels);
  return chosen.filter((r) => r.kind === 'change').slice(0, MAX_REGIONS_PER_ANALYSIS);
}

/**
 * Creates an analysis job: checks the policy and the deployment, answers an
 * earlier job for the same input, reserves the cost ceiling against the
 * budgets, and inserts the job queued. Running it is `runAnalysis`.
 */
export async function createAnalysis(input: CreateInput): Promise<CreateOutcome> {
  const { comparison: c } = input;
  const head = c.pair.head!;
  if (!gatewayKey()) throw new AnalysisError('UNAVAILABLE', 'This deployment has no AI gateway key (AI_GATEWAY_API_KEY).', 'An administrator sets it; the analysis runs where it is set.');
  const ai = visualAiSettings(input.projectSettings);
  const model = modelFor(ai.model);
  if (!model) throw new AnalysisError('UNAVAILABLE', 'No model is allowed on this deployment (VISUAL_AI_MODELS).');
  const target = (await policyTargetsFor([head])).get(head.id)!;
  const policy = decidePolicy(input.projectSettings, 'ai', target);
  if (!policy.allowed) throw new AnalysisError('POLICY_DENIED', `AI analysis is not allowed for this screen: ${policy.reason}`, 'A project admin changes it under Settings → Visual comparison.');
  if (input.trigger === 'proactive' && ai.mode !== 'proactive') throw new AnalysisError('POLICY_DENIED', 'The project does not analyse runs proactively.');
  const regions = chooseRegions(regionsOf(c, 'raw'), input.regionIds);
  if (regions.length === 0) throw new AnalysisError('INVALID', 'No changed region to analyse: the comparison has no measured change, or the regions asked for do not exist.', 'Call get_visual_diff for the regions.');
  const purpose = input.purpose ?? 'suggest_ignore';
  const print = fingerprint([c.pair.base!.sha256, head.sha256, c.revision, regions.map((r) => r.id), purpose, model, PROMPT_VERSION, SCHEMA_VERSION]);

  const [existing] = await db.select().from(visualAnalysisJobs).where(and(eq(visualAnalysisJobs.projectId, input.projectId), eq(visualAnalysisJobs.inputFingerprint, print)));
  if (existing && existing.status !== 'failed') return { job: existing, created: false };
  if (input.idempotencyKey) {
    const [same] = await db.select().from(visualAnalysisJobs).where(and(eq(visualAnalysisJobs.projectId, input.projectId), eq(visualAnalysisJobs.idempotencyKey, input.idempotencyKey)));
    if (same) return { job: same, created: false };
  }

  const images = Math.min(MAX_CROPS_PER_ANALYSIS, regions.length * 2);
  const ceiling = costCeiling(model, { images, textTokens: PROMPT_TEXT_TOKENS + regions.length * 120, maxOutputTokens: MAX_OUTPUT_TOKENS });
  const cap = Math.min(ai.perJobMaxMicroUsd, input.maxMicroUsd ?? Infinity);
  if (ceiling > cap) throw new AnalysisError('BUDGET_EXCEEDED', `This analysis could cost up to $${(ceiling / 1e6).toFixed(4)}, more than the $${(cap / 1e6).toFixed(4)} allowed per analysis.`, 'Ask for fewer regions, or raise the per-analysis limit in the project settings.');

  const id = randomUUID();
  const job: typeof visualAnalysisJobs.$inferInsert = {
    id,
    projectId: input.projectId,
    teamId: input.teamId,
    baseCaptureId: c.pair.base!.id,
    headCaptureId: head.id,
    revision: c.revision,
    regionIds: regions.map((r) => r.id),
    purpose,
    inputFingerprint: print,
    idempotencyKey: input.idempotencyKey ?? null,
    status: 'queued',
    trigger: input.trigger,
    model,
    provider: 'vercel-ai-gateway',
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    priceVersion: PRICE_VERSION,
    reservedMicroUsd: ceiling,
    createdBy: input.userId,
  };
  if (existing?.status === 'failed') await db.delete(visualAnalysisJobs).where(eq(visualAnalysisJobs.id, existing.id));
  await db.insert(visualAnalysisJobs).values(job);
  try {
    await reserve({ teamId: input.teamId, projectId: input.projectId, jobId: id, microUsd: ceiling, limits: { teamMicroUsd: teamMonthlyLimit(), projectMicroUsd: ai.monthlyBudgetMicroUsd } });
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      await db.update(visualAnalysisJobs).set({ status: 'over_budget', error: error.message, reservedMicroUsd: 0, finishedAt: new Date() }).where(eq(visualAnalysisJobs.id, id));
      throw new AnalysisError('BUDGET_EXCEEDED', error.message, 'Raise the budget under Settings → Visual comparison, or wait for next month.');
    }
    throw error;
  }
  const [row] = await db.select().from(visualAnalysisJobs).where(eq(visualAnalysisJobs.id, id));
  return { job: row, created: true };
}

/** What the model call takes and answers: replaceable in tests. */
export interface ModelCall {
  (input: { model: string; system: string; messages: ModelMessage[]; signal: AbortSignal }): Promise<{ output: AnalysisAnswer; usage: { inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null } }>;
}

export const gatewayCall: ModelCall = async ({ model, system, messages, signal }) => {
  const gateway = createGateway({ apiKey: gatewayKey() ?? undefined });
  const result = await generateText({
    model: gateway(model),
    system,
    messages,
    output: Output.object({ schema: analysisAnswer }),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 0,
    abortSignal: signal,
  });
  return {
    output: result.output,
    usage: { inputTokens: result.usage.inputTokens ?? null, outputTokens: result.usage.outputTokens ?? null, reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? null },
  };
};

/** `VISUAL_AI_TIMEOUT_MS`: how long one model call may take (default 60 s). */
const timeoutMs = () => {
  const n = Number(process.env.VISUAL_AI_TIMEOUT_MS);
  return Number.isFinite(n) && n > 1000 ? n : 60_000;
};

/** The actual cost of a call from its usage, with the price table a job was costed with. */
function actualCost(model: string, usage: { inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null }): number | null {
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  return costCeiling(model, { images: 0, textTokens: usage.inputTokens, maxOutputTokens: usage.outputTokens + (usage.reasoningTokens ?? 0) });
}

/**
 * Runs one queued job: claims it, renders the crops, makes the one model
 * call, checks every proposed box against its region, measures what each
 * would leave out, stores the suggestions and settles the budget. A failure
 * is recorded on the job; the reservation is settled as spent when the
 * provider's answer — and so its bill — is unknown.
 */
export async function runAnalysis(jobId: string, opts: { call?: ModelCall } = {}): Promise<AnalysisStatus> {
  const [job] = await db
    .update(visualAnalysisJobs)
    .set({ status: 'running', claimedAt: sql`now()`, startedAt: sql`coalesce(${visualAnalysisJobs.startedAt}, now())`, attempts: sql`${visualAnalysisJobs.attempts} + 1` })
    .where(and(eq(visualAnalysisJobs.id, jobId), sql`${visualAnalysisJobs.status} in ('queued', 'running')`, sql`(${visualAnalysisJobs.claimedAt} is null or ${visualAnalysisJobs.claimedAt} < now() - make_interval(secs => ${JOB_CLAIM_TTL_MS / 1000}))`))
    .returning();
  if (!job) {
    const [row] = await db.select({ status: visualAnalysisJobs.status }).from(visualAnalysisJobs).where(eq(visualAnalysisJobs.id, jobId));
    return row?.status ?? 'failed';
  }
  const fail = async (message: string, billed: boolean) => {
    await db.update(visualAnalysisJobs).set({ status: 'failed', error: message.slice(0, 500), finishedAt: new Date(), claimedAt: null }).where(eq(visualAnalysisJobs.id, jobId));
    await settle({ teamId: job.teamId, projectId: job.projectId, jobId, actualMicroUsd: billed ? null : 0 });
    return 'failed' as const;
  };
  try {
    const [project] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, job.projectId));
    const pair = await resolvePair(job.projectId, job.baseCaptureId, job.headCaptureId);
    if (!pair) return fail('A capture of the comparison is gone.', false);
    // The policy is checked again right before the provider is called: a deny saved meanwhile holds.
    const target = (await policyTargetsFor([pair.head!])).get(pair.head!.id)!;
    const policy = decidePolicy(project?.settings, 'ai', target);
    if (!policy.allowed) {
      await db.update(visualAnalysisJobs).set({ status: 'denied', error: policy.reason, finishedAt: new Date(), claimedAt: null }).where(eq(visualAnalysisJobs.id, jobId));
      await settle({ teamId: job.teamId, projectId: job.projectId, jobId, actualMicroUsd: 0 });
      return 'denied';
    }
    const [c] = await compare([pair]);
    if (c.revision !== job.revision) return fail('The comparison changed (its rules or settings) since the analysis was asked for.', false);
    const regions = regionsOf(c, 'raw').filter((r) => job.regionIds.includes(r.id));
    if (regions.length === 0) return fail('The regions are no longer measured.', false);
    const [baseSource, headSource] = await Promise.all([loadSource(pair.base!), loadSource(pair.head!)]);
    if (!baseSource || !headSource) return fail('An image of the comparison is not stored.', false);
    const [context, runs] = await Promise.all([contextFor([pair.head!]), runInfoFor(job.projectId, [pair.base!.runId, pair.head!.runId])]);
    const t = context.get(pair.head!.id)!;
    const padding = Math.round(DEFAULT_CONTEXT_PADDING * (pair.head!.deviceScaleFactor ?? 1));
    const crops = new Map<string, { base: Rect | null; head: Rect | null }>();
    const content: (TextPart | ImagePart)[] = [];
    const push = (part: TextPart | ImagePart) => content.push(part);
    push({ type: 'text', text: introText({ test: t.test.titlePath.join(' › ') || t.test.title, file: t.test.file, checkpoint: t.checkpoint.title ?? t.checkpoint.name, stepPath: t.checkpoint.stepPath, url: t.checkpoint.url, baseRun: runs.get(pair.base!.runId)?.number ?? null, headRun: runs.get(pair.head!.runId)?.number ?? null }, regions.length) });
    let images = 0;
    for (const region of regions) {
      const box = region.headRect ?? region.baseRect!;
      const headRect = region.headRect ? padRect(box, padding, headSource) : null;
      const baseRect = padRect(box, padding, baseSource);
      const crop = { base: baseRect, head: headRect };
      crops.set(region.id, crop);
      push({ type: 'text', text: regionText(region, crop, pair.head!.deviceScaleFactor) });
      for (const [side, rect, source] of [
        ['BASE', baseRect, baseSource],
        ['HEAD', headRect, headSource],
      ] as const) {
        if (!rect || images >= MAX_CROPS_PER_ANALYSIS) continue;
        try {
          const out = await render({ mode: side === 'BASE' ? 'base' : 'head', side: side === 'BASE' ? 'base' : 'head', rect, maxBytes: CROP_MAX_BYTES }, { base: baseSource, head: headSource, overlay: null, threshold: c.settings.threshold, policy: 'raw', ignore: [] });
          push({ type: 'text', text: `${side} crop of ${region.label}:` });
          push({ type: 'image', image: new Uint8Array(out.data), mediaType: out.mimeType });
          images++;
        } catch (error) {
          if (!(error instanceof RenderError)) throw error;
        }
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    let answer: Awaited<ReturnType<ModelCall>>;
    try {
      const messages: ModelMessage[] = [{ role: 'user', content }];
      answer = await (opts.call ?? gatewayCall)({ model: job.model, system: SYSTEM_PROMPT, messages, signal: controller.signal });
    } catch (error) {
      // The provider may have answered and billed; the reservation stays spent.
      return fail(`The model call failed: ${(error as Error).message}`, true);
    } finally {
      clearTimeout(timer);
    }
    const suggestions: (typeof visualAnalysisSuggestions.$inferInsert)[] = [];
    const [baseBytes, headBytes] = await Promise.all([readCaptureBytes(pair.base!), readCaptureBytes(pair.head!)]);
    for (const r of answer.output.regions) {
      const region = regions.find((x) => x.id === r.regionId || x.label === r.regionId);
      if (!region) continue;
      const crop = crops.get(region.id)!;
      const { rects } = crop.head && r.recommendation === 'consider_ignore' ? validateBoxes(r.dynamicBoxes, crop.head, region) : { rects: [] as Rect[] };
      let effect: { rawChangedPixels: number; suppressedPixels: number; remainingPixels: number } | null = null;
      if (rects.length && baseBytes && headBytes) {
        try {
          const p = await previewRules(Buffer.from(baseBytes.bytes), Buffer.from(headBytes.bytes), rects, c.settings.threshold);
          effect = { rawChangedPixels: p.rawChangedPixels, suppressedPixels: p.suppressedPixels, remainingPixels: p.effectiveChangedPixels };
        } catch {
          effect = null;
        }
      }
      suggestions.push({
        id: randomUUID(),
        jobId,
        projectId: job.projectId,
        regionId: region.id,
        regionLabel: region.label,
        observation: r.observation,
        hypothesis: (ANALYSIS_HYPOTHESES as readonly string[]).includes(r.hypothesis) ? r.hypothesis : 'unknown',
        alternatives: r.alternatives,
        recommendation: (ANALYSIS_RECOMMENDATIONS as readonly string[]).includes(r.recommendation) ? r.recommendation : 'investigate',
        uncertainty: r.uncertainty,
        proposedRects: rects,
        effect,
      });
    }
    if (suggestions.length) await db.insert(visualAnalysisSuggestions).values(suggestions);
    const actual = actualCost(job.model, answer.usage);
    await db
      .update(visualAnalysisJobs)
      .set({ status: 'done', summary: answer.output.summary.slice(0, 600), usage: { ...answer.usage, images }, actualMicroUsd: actual, finishedAt: new Date(), claimedAt: null })
      .where(eq(visualAnalysisJobs.id, jobId));
    await settle({ teamId: job.teamId, projectId: job.projectId, jobId, actualMicroUsd: actual });
    return 'done';
  } catch (error) {
    return fail((error as Error).message, false);
  }
}

/** A job as the viewer and the tools show it, with its suggestions. */
export async function analysisView(projectId: string, jobId: string): Promise<AnalysisView | null> {
  const [job] = await db.select().from(visualAnalysisJobs).where(and(eq(visualAnalysisJobs.projectId, projectId), eq(visualAnalysisJobs.id, jobId)));
  if (!job) return null;
  const suggestions = await db.select().from(visualAnalysisSuggestions).where(eq(visualAnalysisSuggestions.jobId, jobId)).orderBy(visualAnalysisSuggestions.regionLabel);
  // A running job whose claim expired belongs to a worker that died.
  const status: AnalysisStatus = job.status === 'running' && job.claimedAt && Date.now() - job.claimedAt.getTime() > JOB_CLAIM_TTL_MS ? 'failed' : job.status;
  return {
    id: job.id,
    status,
    model: job.model,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    summary: job.summary,
    error: status === 'failed' && job.status === 'running' ? 'The analysis did not finish in time.' : job.error,
    reservedMicroUsd: job.reservedMicroUsd,
    actualMicroUsd: job.actualMicroUsd,
    suggestions: suggestions.map((s) => ({
      id: s.id,
      regionId: s.regionId,
      regionLabel: s.regionLabel,
      observation: s.observation,
      hypothesis: s.hypothesis as AnalysisView['suggestions'][number]['hypothesis'],
      alternatives: s.alternatives,
      recommendation: s.recommendation as AnalysisView['suggestions'][number]['recommendation'],
      uncertainty: s.uncertainty,
      proposedRects: s.proposedRects,
      effect: s.effect,
      decision: s.decision,
    })),
  };
}

/** The newest analyses of a pair, newest first. */
export async function analysesOfPair(projectId: string, baseCaptureId: string, headCaptureId: string, limit = 5): Promise<AnalysisView[]> {
  const rows = await db
    .select({ id: visualAnalysisJobs.id })
    .from(visualAnalysisJobs)
    .where(and(eq(visualAnalysisJobs.projectId, projectId), eq(visualAnalysisJobs.baseCaptureId, baseCaptureId), eq(visualAnalysisJobs.headCaptureId, headCaptureId)))
    .orderBy(desc(visualAnalysisJobs.createdAt))
    .limit(limit);
  const views = await Promise.all(rows.map((r) => analysisView(projectId, r.id)));
  return views.filter((v): v is AnalysisView => Boolean(v));
}

/**
 * A person accepts or rejects a suggestion. Accepting writes the proposed
 * rectangles (or the person's edit of them) as rules of the head capture's
 * checkpoint, source `ai_suggestion`, through the editor's own path — with
 * the rule revision check and the policy.
 */
export async function decideSuggestion(input: { projectId: string; projectSettings: Record<string, unknown>; suggestionId: string; decision: 'accepted' | 'rejected'; rects?: readonly Rect[]; expectedRevision?: number | null; userId: string | null; source: 'app' | 'mcp' }) {
  const [s] = await db.select().from(visualAnalysisSuggestions).where(and(eq(visualAnalysisSuggestions.projectId, input.projectId), eq(visualAnalysisSuggestions.id, input.suggestionId)));
  if (!s) throw new AnalysisError('NOT_FOUND', 'That suggestion is not in this project.');
  if (s.decision !== 'open') throw new AnalysisError('INVALID', `The suggestion was ${s.decision} already.`);
  const [job] = await db.select().from(visualAnalysisJobs).where(eq(visualAnalysisJobs.id, s.jobId));
  let ruleRevision: number | null = null;
  if (input.decision === 'accepted') {
    const rects = input.rects ?? s.proposedRects;
    if (!rects.length) throw new AnalysisError('INVALID', 'There is nothing to accept: the suggestion proposes no rectangle.');
    const found = await rulesOfCapture(input.projectId, job.headCaptureId);
    if (!found) throw new AnalysisError('NOT_FOUND', 'The capture is gone.');
    const target = (await policyTargetsFor([found.capture])).get(found.capture.id)!;
    const policy = decidePolicy(input.projectSettings, 'ignore', target);
    if (!policy.allowed) throw new AnalysisError('POLICY_DENIED', `Leaving areas out is not allowed for this screen: ${policy.reason}`);
    const hypothesis = s.hypothesis;
    const category = hypothesis === 'time_dependent' ? 'time_dependent' : hypothesis === 'image_content' ? 'image_content' : 'dynamic_text';
    const kept = found.rules.map((r) => ({ id: r.id, x: r.x, y: r.y, width: r.width, height: r.height, reason: r.reason, category: r.category, active: r.active }));
    const added = rects.map((r) => ({ ...r, id: null, reason: `${s.observation.slice(0, 300)} (AI suggestion, ${s.regionLabel})`, category: category as 'time_dependent' | 'image_content' | 'dynamic_text', active: true }));
    const set = await setRules({ projectId: input.projectId, capture: found.capture, rules: [...kept, ...added], expectedRevision: input.expectedRevision ?? found.revision, reason: `Accepted AI suggestion for ${s.regionLabel}`, source: 'ai_suggestion', userId: input.userId, analysisId: s.jobId });
    ruleRevision = set.revision;
  }
  await db.update(visualAnalysisSuggestions).set({ decision: input.decision, decidedBy: input.userId, decidedAt: new Date(), ruleRevision }).where(eq(visualAnalysisSuggestions.id, s.id));
  return { ruleRevision, headCaptureId: job.headCaptureId };
}

/**
 * Proactive mode: after a run's comparisons are measured, one analysis per
 * changed screen whose policy allows it — deduplicated by input, capped per
 * run, and stopped by the budget. Nothing else: suggestions wait for people.
 */
export const MAX_PROACTIVE_PER_RUN = 10;

export async function proactiveAnalyses(runId: string, captures: readonly (CaptureRecord & { projectId: string })[], opts: { call?: ModelCall } = {}): Promise<{ created: number; skipped: number }> {
  if (!gatewayKey() || captures.length === 0) return { created: 0, skipped: captures.length };
  const projectIds = [...new Set(captures.map((c) => c.projectId))];
  const rows = await db.select({ id: projects.id, teamId: projects.teamId, settings: projects.settings }).from(projects).where(inArray(projects.id, projectIds));
  let created = 0;
  let skipped = 0;
  for (const project of rows) {
    if (visualAiSettings(project.settings).mode !== 'proactive') {
      skipped += captures.filter((c) => c.projectId === project.id).length;
      continue;
    }
    const { runCaptures } = await import('../diff/store');
    const compared = (await runCaptures(runId)).filter((c) => c.projectId === project.id && c.diff?.status === 'done' && (c.diff.changedPixels ?? 0) > 0);
    for (const cap of compared) {
      if (created >= MAX_PROACTIVE_PER_RUN) {
        skipped++;
        continue;
      }
      const reference = cap.diffAgainst === 'baseline' ? cap.baseline?.capture : cap.previous?.capture;
      if (!reference) continue;
      const pair = await resolvePair(project.id, reference.id, cap.id);
      if (!pair) continue;
      const [c] = await compare([pair]);
      if (!c.comparisonId || !c.revision) continue;
      try {
        const outcome = await createAnalysis({ projectId: project.id, teamId: project.teamId, projectSettings: project.settings, comparison: c as CreateInput['comparison'], trigger: 'proactive', userId: null });
        if (outcome.created) {
          created++;
          if (analysisDriver() === 'inline') await runAnalysis(outcome.job.id, opts);
          else if (analysisDriver() === 'after') await runAnalysis(outcome.job.id, opts);
        } else skipped++;
      } catch (error) {
        skipped++;
        if (error instanceof AnalysisError && error.code === 'BUDGET_EXCEEDED') break;
        if (!(error instanceof AnalysisError)) console.error('[visual-ai] proactive analysis failed', error);
      }
    }
  }
  return { created, skipped };
}

