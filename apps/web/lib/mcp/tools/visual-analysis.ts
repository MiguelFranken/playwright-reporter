/**
 * The optional AI analysis of a visual comparison, for assistants: a job the
 * reporter pays for, under the project's policy and budget, that explains the
 * regions and may propose tight areas to leave out — which a person accepts
 * or rejects. An agent with a write-scoped token may start one when the user
 * asked; it never accepts suggestions on the user's behalf unless asked to.
 */
import { z } from 'zod';
import { ANALYSIS_HYPOTHESES, ANALYSIS_RECOMMENDATIONS, ANALYSIS_STATUSES, decodeComparisonId, formatMicroUsd } from '@miguelfranken/ui/lib/visual-diff';
import { AnalysisError, analysisView, analysesOfPair, createAnalysis, decideSuggestion } from '@/lib/review/analysis/jobs';
import { dispatchAnalysis } from '@/lib/review/analysis/dispatch';
import { compare, resolvePair } from '@/lib/review/diff/comparison';
import { invalid, notFound, ToolError } from '../errors';
import { commonParams, isUuid } from '../params';
import { defineTool, output } from '../registry';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;

const rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });

const suggestionOut = z.object({
  id: z.string(),
  regionId: z.string(),
  regionLabel: z.string(),
  observation: z.string(),
  hypothesis: z.enum(ANALYSIS_HYPOTHESES),
  alternatives: z.array(z.string()),
  recommendation: z.enum(ANALYSIS_RECOMMENDATIONS),
  uncertainty: z.enum(['low', 'medium', 'high']),
  proposedRects: z.array(rect).describe('Tight rectangles the model proposes leaving out, already checked against the region; empty unless it recommends considering a rule.'),
  effect: z.object({ rawChangedPixels: z.number(), suppressedPixels: z.number(), remainingPixels: z.number() }).nullable().describe('What the proposal would do, measured on the two images.'),
  decision: z.enum(['open', 'accepted', 'rejected']),
});

const analysisOut = output({
  project: z.string(),
  analysisId: z.string(),
  status: z.enum(ANALYSIS_STATUSES),
  model: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  reservedMicroUsd: z.number(),
  actualMicroUsd: z.number().nullable(),
  suggestions: z.array(suggestionOut),
  retryAfterMs: z.number().nullable(),
  created: z.boolean().optional().describe('analyze_visual_diff: false when the same input was analysed before and that analysis is answered instead.'),
});

function toOut(project: string, v: NonNullable<Awaited<ReturnType<typeof analysisView>>>, created?: boolean): z.infer<typeof analysisOut> {
  return {
    project,
    analysisId: v.id,
    status: v.status,
    model: v.model,
    createdAt: v.createdAt,
    finishedAt: v.finishedAt,
    summary: v.summary,
    error: v.error,
    reservedMicroUsd: v.reservedMicroUsd,
    actualMicroUsd: v.actualMicroUsd,
    suggestions: v.suggestions,
    retryAfterMs: v.status === 'queued' || v.status === 'running' ? 3000 : null,
    ...(created === undefined ? {} : { created }),
  };
}

function renderAnalysis(md: { heading(s: string, l?: number): void; line(s: string): void; table(h: string[], r: (string | number | null | undefined)[][]): number }, d: z.infer<typeof analysisOut>) {
  md.heading(`Analysis ${d.analysisId}: ${d.status}`, 2);
  md.line(`Model ${d.model} · reserved ${formatMicroUsd(d.reservedMicroUsd)}${d.actualMicroUsd !== null ? `, cost ${formatMicroUsd(d.actualMicroUsd)}` : ''}${d.error ? ` · ${d.error}` : ''}`);
  if (d.summary) md.line(d.summary);
  if (d.suggestions.length)
    md.table(
      ['Region', 'Observation', 'Hypothesis', 'Uncertainty', 'Recommendation', 'Proposed rectangles', 'Effect', 'Decision'],
      d.suggestions.map((s) => [s.regionLabel, s.observation, s.hypothesis, s.uncertainty, s.recommendation, s.proposedRects.map((r) => `${r.x}, ${r.y}, ${r.width}, ${r.height}`).join('; ') || '—', s.effect ? `${s.effect.suppressedPixels} of ${s.effect.rawChangedPixels} px left out, ${s.effect.remainingPixels} remain` : '—', s.decision]),
    );
  if (d.retryAfterMs) md.line('Still running: call get_visual_diff_analysis again in a few seconds.');
  if (d.status === 'done') md.line('A hypothesis is the model’s reading of two images, not a proof: check the producing test and its data before acting on it. A proposal becomes a rule only when a person accepts it.');
}

const mapError = (error: unknown) => {
  if (error instanceof AnalysisError) {
    const code = error.code === 'UNAVAILABLE' ? 'ANALYSIS_FAILED' : error.code === 'INVALID' ? 'INVALID_ARGUMENT' : error.code;
    return new ToolError(code, error.message, error.hint);
  }
  return error;
};

// ---------------------------------------------------------------- analyze_visual_diff

const analyzeInput = z.object({
  ...commonParams,
  comparison: z.string().describe('The comparisonId.'),
  regionIds: z.array(z.string()).max(4).optional().describe('Up to 4 regions (ids or labels); default: the 4 largest changes.'),
  purpose: z.enum(['explain', 'suggest_ignore']).optional().describe('explain: observations and hypotheses only. suggest_ignore (default): also tight areas the model would leave out, for a person to accept.'),
  idempotencyKey: z.string().max(120).optional().describe('Your own key against retries: the same key answers the same job.'),
  maxMicroUsd: z.number().int().min(1000).optional().describe('A cap below the project’s per-analysis limit, in micro-dollars (1,000,000 = $1).'),
});

export const analyzeVisualDiff = defineTool({
  name: 'analyze_visual_diff',
  title: 'Ask a model about a visual difference',
  toolset: 'write',
  description:
    'Starts one AI analysis of a comparison’s changed regions, paid for by the reporter under the project’s policy and monthly budget: what each region shows (a random name, a clock, a real change), how sure the model is, and — on request — tight rectangles it would leave out, measured for their effect, waiting for a person to accept. The same input is analysed once. Only when the user asked for it; it changes nothing by itself. Poll with get_visual_diff_analysis.',
  input: analyzeInput,
  output: analysisOut,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { review: ['decide'] });
    const decoded = decodeComparisonId(args.comparison.trim());
    if (!decoded) throw new ToolError('INVALID_COMPARISON', `"${args.comparison}" is not a comparison id.`);
    const pair = await resolvePair(project.project.id, decoded.baseCaptureId, decoded.headCaptureId);
    if (!pair) throw notFound('That comparison is not in this project.');
    const [c] = await compare([pair], { plan: true });
    if (!c.comparisonId || !c.revision) throw invalid('The comparison cannot be analysed.');
    if (c.calculationState !== 'done') throw new ToolError('SOURCE_UNAVAILABLE', `The comparison is not measured yet (${c.calculationState}).`, 'Call get_visual_diff until calculationState is done.');
    try {
      const outcome = await createAnalysis({
        projectId: project.project.id,
        teamId: project.team.id,
        projectSettings: project.project.settings,
        comparison: c as typeof c & { comparisonId: string; revision: string },
        regionIds: args.regionIds,
        purpose: args.purpose,
        trigger: 'mcp',
        userId: project.user.id,
        idempotencyKey: args.idempotencyKey ?? null,
        maxMicroUsd: args.maxMicroUsd ?? null,
      });
      if (outcome.created) await dispatchAnalysis(outcome.job.id);
      const view = (await analysisView(project.project.id, outcome.job.id))!;
      return { data: toOut(project.ref, view, outcome.created), render: renderAnalysis };
    } catch (error) {
      throw mapError(error);
    }
  },
});

// ---------------------------------------------------------------- get_visual_diff_analysis

const getInput = z.object({
  ...commonParams,
  analysis: z.string().optional().describe('The analysisId from analyze_visual_diff.'),
  comparison: z.string().optional().describe('Instead: the comparisonId, for its newest analysis.'),
});

export const getVisualDiffAnalysis = defineTool({
  name: 'get_visual_diff_analysis',
  title: 'Get an AI analysis of a visual difference',
  toolset: 'core',
  description: 'The state and result of an AI analysis: its status, the model’s summary, and per region the observation, hypothesis, uncertainty, recommendation, proposed rectangles with their measured effect, and whether a person accepted or rejected each. By analysis id, or the newest for a comparison.',
  input: getInput,
  output: analysisOut,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    let view;
    if (args.analysis) {
      if (!isUuid(args.analysis)) throw invalid('"analysis" is an analysis id.');
      view = await analysisView(project.project.id, args.analysis.toLowerCase());
    } else if (args.comparison) {
      const decoded = decodeComparisonId(args.comparison.trim());
      if (!decoded) throw new ToolError('INVALID_COMPARISON', `"${args.comparison}" is not a comparison id.`);
      [view] = await analysesOfPair(project.project.id, decoded.baseCaptureId, decoded.headCaptureId, 1);
    } else throw invalid('Pass "analysis" or "comparison".');
    if (!view) throw notFound('No such analysis.', 'Start one with analyze_visual_diff (write scope).');
    return { data: toOut(project.ref, view), render: renderAnalysis };
  },
});

// ---------------------------------------------------------------- decide_visual_suggestion

const decideInput = z.object({
  ...commonParams,
  suggestion: z.string().describe('The suggestion id, from the analysis.'),
  decision: z.enum(['accepted', 'rejected']),
  rects: z.array(z.object({ x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().min(1), height: z.number().int().min(1) })).max(5).optional().describe('With accepted: the rectangles to save instead of the proposed ones (a person’s edit).'),
  expectedRevision: z.number().int().min(0).optional().describe('The rule revision you read; refused when it moved.'),
});

const decideOutput = output({ project: z.string(), suggestionId: z.string(), decision: z.string(), ruleRevision: z.number().nullable(), captureId: z.string() });

export const decideVisualSuggestion = defineTool({
  name: 'decide_visual_suggestion',
  title: 'Accept or reject an AI suggestion',
  toolset: 'write',
  description: 'Records a person’s decision about one suggestion. Accepting saves its rectangles (or the given edit of them) as rules of the screen, source "AI suggestion", under the project’s policy and the rule revision check; rejecting keeps it as history. Only when the user decided — a suggestion is never accepted on their behalf.',
  input: decideInput,
  output: decideOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { review: ['decide'] });
    if (!isUuid(args.suggestion)) throw invalid('"suggestion" is a suggestion id.');
    try {
      const res = await decideSuggestion({ projectId: project.project.id, projectSettings: project.project.settings, suggestionId: args.suggestion.toLowerCase(), decision: args.decision, rects: args.rects, expectedRevision: args.expectedRevision, userId: project.user.id, source: 'mcp' });
      return {
        data: { project: project.ref, suggestionId: args.suggestion.toLowerCase(), decision: args.decision, ruleRevision: res.ruleRevision, captureId: res.headCaptureId },
        render(md, d) {
          md.line(d.decision === 'accepted' ? `Accepted: rules saved as revision ${d.ruleRevision}; the comparison is measured again under them.` : 'Rejected and kept as history.');
        },
      };
    } catch (error) {
      const { IgnoreRevisionConflict } = await import('@/lib/review/diff/ignore');
      if (error instanceof IgnoreRevisionConflict) throw new ToolError('REVISION_CONFLICT', error.message);
      throw mapError(error);
    }
  },
});

export const VISUAL_ANALYSIS_TOOLS = [analyzeVisualDiff, getVisualDiffAnalysis, decideVisualSuggestion];
