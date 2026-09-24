import { z } from 'zod';
import { getResultInRun } from '@/lib/db/queries/mcp';
import { testExecutions } from '@/lib/db/queries/mcp-analysis';
import { verifyFix } from '../analysis/fix-verification';
import { browserParam, commonParams, fileParam, runParam, testParam } from '../params';
import { defineTool, output } from '../registry';
import { STRIP_LEGEND, link, outcomeStrip, when } from '../render/markdown';
import { firstLine } from '../render/sanitize';
import { resolveRun, resolveTest } from '../resolve';

const input = z.object({
  ...commonParams,
  test: testParam,
  file: fileParam,
  browser: browserParam,
  baselineRun: runParam.describe('The run the failure happened in.'),
  branch: z.string().optional().describe('Branch to check (default: the baseline run’s branch; "any" for every branch).'),
  requirePasses: z.number().int().min(1).max(20).optional().describe('First-try passes in a row needed to call it fixed (default 1).'),
});

const outputSchema = output({
  project: z.string(),
  test: z.object({ id: z.string(), title: z.string(), url: z.string() }),
  status: z.enum(['fixed', 'unstable', 'intermittent', 'still_failing', 'different_failure', 'no_runs_since', 'baseline_invalid']),
  confidence: z.enum(['low', 'medium', 'high']).nullable(),
  explanation: z.string(),
  baseline: z.object({ runNumber: z.number(), outcome: z.string().nullable(), error: z.string().nullable(), url: z.string() }),
  branch: z.string().nullable(),
  since: z.array(z.object({ runNumber: z.number(), startedAt: z.string(), commit: z.string().nullable(), outcome: z.string(), attempts: z.number(), sameErrorAsBaseline: z.boolean().nullable(), url: z.string() })),
  next: z.string(),
});

export const verifyFixTool = defineTool({
  name: 'verify_fix',
  title: 'Verify fix',
  toolset: 'debug',
  description:
    'After a fix landed: did later runs fix the test? Give the test and the run it failed in. Strict — passing only after retries is "unstable", and a new error is "different_failure", never "fixed".',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const baselineRun = await resolveRun(project, args.baselineRun);
    const test = await resolveTest(project, args.test, { file: args.file, browser: args.browser, runId: baselineRun.id });
    const baselineResultId = await getResultInRun(baselineRun.id, test.id);
    const branch = args.branch === 'any' ? null : (args.branch ?? baselineRun.gitBranch);
    // Executions from the baseline on: the baseline itself, then everything after it.
    const fromBaseline = await testExecutions(test.id, { since: baselineRun.startedAt, limit: 500 });
    const baseline = fromBaseline.find((e) => e.resultId === baselineResultId);
    const since = fromBaseline.filter((e) => e.resultId !== baselineResultId && e.startedAt > baselineRun.startedAt && (!branch || e.branch === branch));
    const verdict = verifyFix({
      baselineOutcome: baseline?.outcome ?? null,
      baselineSignature: baseline?.signature ?? null,
      since: since.map((e) => ({ runNumber: e.runNumber, startedAt: e.startedAt, outcome: e.outcome, attempts: e.attemptCount, signature: e.signature })),
      requirePasses: args.requirePasses,
    });
    const next =
      verdict.status === 'fixed'
        ? verdict.confidence === 'high'
          ? 'Done. Nothing else to verify.'
          : 'Looks fixed; call verify_fix again after a few more runs for higher confidence.'
        : verdict.status === 'no_runs_since'
          ? 'Wait for the next run, then call verify_fix again.'
          : verdict.status === 'baseline_invalid'
            ? 'Pick a baseline run in which the test failed (get_test_history lists them).'
            : `Investigate the latest failure with get_failure_context { "test": "${test.id}" }.`;
    return {
      data: {
        project: project.ref,
        test: { id: test.id, title: test.titlePath.length ? test.titlePath.join(' › ') : test.title, url: project.links.test(test.id) },
        status: verdict.status,
        confidence: verdict.confidence,
        explanation: verdict.explanation,
        baseline: {
          runNumber: baselineRun.number,
          outcome: baseline?.outcome ?? null,
          error: baseline?.errorMessage ? firstLine(baseline.errorMessage, 200) : null,
          url: baselineResultId ? project.links.result(baselineRun.number, baselineResultId) : project.links.run(baselineRun.number),
        },
        branch,
        since: [...since].reverse().map((e) => ({
          runNumber: e.runNumber,
          startedAt: e.startedAt.toISOString(),
          commit: e.shortSha,
          outcome: e.outcome,
          attempts: e.attemptCount,
          sameErrorAsBaseline: e.signature && baseline?.signature ? e.signature === baseline.signature : null,
          url: project.links.result(e.runNumber, e.resultId),
        })),
        next,
      },
      render(md, d) {
        md.heading(`${d.test.title}: ${d.status.replace(/_/g, ' ')}${d.confidence ? ` (${d.confidence} confidence)` : ''}`, 2);
        md.line(d.explanation);
        md.kv([
          ['Baseline', `${link(`#${d.baseline.runNumber}`, d.baseline.url)}: ${d.baseline.outcome ?? 'did not run'}${d.baseline.error ? ` — ${d.baseline.error}` : ''}`],
          ['Checked on', d.branch ?? 'every branch'],
          ['Since (oldest first)', d.since.length ? `${outcomeStrip([...d.since].reverse().map((s) => s.outcome)).split('').reverse().join('')} — ${STRIP_LEGEND.replace('newest first', 'oldest first').toLowerCase()}` : 'no runs yet'],
        ]);
        if (d.since.length) {
          md.table(
            ['Run', 'When', 'Commit', 'Outcome', 'Tries', 'Same error'],
            d.since.map((s) => [link(`#${s.runNumber}`, s.url), when(s.startedAt), s.commit, s.outcome, s.attempts, s.sameErrorAsBaseline === null ? null : s.sameErrorAsBaseline ? 'yes' : 'no']),
          );
        }
        md.line(`Next: ${d.next}`);
      },
    };
  },
});
