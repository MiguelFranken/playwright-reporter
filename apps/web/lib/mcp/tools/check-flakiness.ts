import { z } from 'zod';
import { sameCommitConflicts, testExecutions } from '@/lib/db/queries/mcp-analysis';
import { flakinessVerdict } from '../analysis/flakiness';
import { ruledOut } from '../analysis/ruled-out';
import { branchParam, browserParam, commonParams, fileParam, sinceParam, testParam, timeWindow } from '../params';
import { defineTool, output } from '../registry';
import { STRIP_LEGEND, link, outcomeStrip, pct, when } from '../render/markdown';
import { resolveTest } from '../resolve';

const input = z.object({ ...commonParams, test: testParam, file: fileParam, browser: browserParam, branch: branchParam, since: sinceParam });

const finding = z.object({ text: z.string(), because: z.string() });

const outputSchema = output({
  project: z.string(),
  window: z.string(),
  test: z.object({ id: z.string(), title: z.string(), file: z.string(), browser: z.string(), url: z.string() }),
  verdict: z.enum(['flaky', 'consistently_failing', 'intermittent', 'stable', 'insufficient_data']),
  confidence: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
  evidence: z.object({
    executions: z.number(),
    outcomes: z.object({ passed: z.number(), failed: z.number(), flaky: z.number(), skipped: z.number() }),
    retryFlakyRuns: z.number(),
    sameCommitConflicts: z.array(z.object({ sha: z.string(), passed: z.number(), failed: z.number(), flaky: z.number(), runNumbers: z.array(z.number()) })),
    flipRate: z.number(),
    lastFlakyAt: z.string().nullable(),
    history: z.string(),
    byEnvironment: z.array(z.object({ environment: z.string().nullable(), runs: z.number(), flakyRate: z.number(), failureRate: z.number() })),
  }),
  ruledOut: z.array(finding),
  pointsTo: z.array(finding),
});

export const checkFlakiness = defineTool({
  name: 'check_flakiness',
  title: 'Check flakiness',
  toolset: 'debug',
  description:
    'Is this test flaky, broken, or is there not enough data to say? Judges across runs: retries that passed, the same commit both passing and failing, and how often it flips. Returns a verdict with confidence and the evidence behind it.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const test = await resolveTest(project, args.test, { file: args.file, browser: args.browser });
    const window = timeWindow(args, { defaultSince: '30d', max: '180d' });
    const [executions, conflicts] = await Promise.all([
      testExecutions(test.id, { since: window.since, branch: args.branch, limit: 500 }),
      sameCommitConflicts(test.id, window.since, args.branch),
    ]);
    const result = flakinessVerdict(executions.map((e) => ({ outcome: e.outcome, startedAt: e.startedAt, signature: e.signature })), conflicts);
    const envs = new Map<string | null, { runs: number; flaky: number; failed: number }>();
    for (const e of executions) {
      if (e.outcome === 'skipped') continue;
      const v = envs.get(e.environment) ?? { runs: 0, flaky: 0, failed: 0 };
      v.runs++;
      if (e.outcome === 'flaky') v.flaky++;
      if (e.outcome === 'failed' || e.outcome === 'timedout') v.failed++;
      envs.set(e.environment, v);
    }
    const byEnvironment = [...envs.entries()].map(([environment, v]) => ({ environment, runs: v.runs, flakyRate: v.flaky / v.runs, failureRate: v.failed / v.runs }));
    const findings = ruledOut({
      attemptVerdict: result.verdict === 'flaky' ? 'flaky' : null,
      category: null,
      siblingOutcomes: [],
      environments: byEnvironment,
      regression: null,
      failingOnBase: null,
      onBaseBranch: true,
      sameErrorInRun: 0,
      sameCommitConflicts: conflicts.length,
    });
    const lastFlaky = executions.find((e) => e.outcome === 'flaky');
    return {
      data: {
        project: project.ref,
        window: window.label,
        test: { id: test.id, title: test.titlePath.length ? test.titlePath.join(' › ') : test.title, file: test.file, browser: test.pwProject, url: project.links.test(test.id) },
        verdict: result.verdict,
        confidence: result.confidence,
        reason: result.reason,
        evidence: {
          ...result.evidence,
          sameCommitConflicts: conflicts.slice(0, 10),
          lastFlakyAt: lastFlaky?.startedAt.toISOString() ?? null,
          history: outcomeStrip(executions.slice(0, 30).map((e) => e.outcome)),
          byEnvironment,
        },
        ruledOut: findings.ruledOut.map((f) => ({ text: f.fix!, because: f.because })),
        pointsTo: findings.pointsTo.map((f) => ({ text: f.direction!, because: f.because })),
      },
      render(md, d) {
        md.heading(`${d.test.title}: ${d.verdict.replace('_', ' ')} (${d.confidence} confidence)`, 2);
        md.line(`${d.test.file} · ${d.test.browser} · ${link('open in app', d.test.url)} · ${d.window}${args.branch ? ` on ${args.branch}` : ''}`);
        md.line(d.reason);
        const e = d.evidence;
        md.kv([
          ['Executions', `${e.executions} (passed ${e.outcomes.passed}, failed ${e.outcomes.failed}, flaky ${e.outcomes.flaky}, skipped ${e.outcomes.skipped})`],
          ['History (newest first)', e.history ? `${e.history} — ${STRIP_LEGEND.toLowerCase()}` : null],
          ['Pass↔fail flips', pct(e.flipRate)],
          ['Last passed only on retry', e.lastFlakyAt ? when(e.lastFlakyAt) : null],
          ['By environment', e.byEnvironment.length > 1 ? e.byEnvironment.map((x) => `${x.environment ?? '(none)'}: flaky ${pct(x.flakyRate)}, failing ${pct(x.failureRate)} of ${x.runs}`).join('; ') : null],
        ]);
        if (e.sameCommitConflicts.length) {
          md.heading('Same commit, different results', 3);
          md.table(['Commit', 'Passed', 'Failed', 'Flaky', 'Runs'], e.sameCommitConflicts.map((c) => [c.sha.slice(0, 7), c.passed, c.failed, c.flaky, c.runNumbers.map((n) => `#${n}`).join(' ')]));
        }
        if (d.ruledOut.length || d.pointsTo.length) {
          md.heading('What the evidence rules out', 3);
          md.list(d.ruledOut.map((x) => `✗ ${x.text} — ${x.because}`));
          md.list(d.pointsTo.map((x) => `→ ${x.text} (${x.because})`));
        }
        md.line('For the latest failure itself, call get_failure_context. To reproduce a flake locally: get_rerun_command with repeat.');
      },
    };
  },
});
