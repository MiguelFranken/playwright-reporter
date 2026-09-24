import { reliabilityLabel } from '@miguelfranken/ui/lib/reliability';
import { z } from 'zod';
import { dashboardStats, passFailTrend } from '@/lib/db/queries/dashboard';
import { searchTests, topErrorSignatures } from '@/lib/db/queries/mcp';
import { rankFixFirst } from '../analysis/health-ranking';
import { branchParam, commonParams, sinceParam, timeWindow } from '../params';
import { defineTool, output } from '../registry';
import { dur, link, pct } from '../render/markdown';
import { firstLine } from '../render/sanitize';
import { categoryOf } from './shared';

const input = z.object({ ...commonParams, branch: branchParam, since: sinceParam });

const testRef = z.object({ testId: z.string(), title: z.string(), file: z.string(), browser: z.string(), url: z.string() });

const outputSchema = output({
  project: z.string(),
  window: z.string(),
  branch: z.string().nullable(),
  stats: z.object({
    finishedRuns: z.number(),
    runPassRate: z.number().nullable(),
    reliability: z.number().nullable(),
    reliabilityLabel: z.string().nullable(),
    trackedTests: z.number(),
    newTests: z.number(),
    avgRunDurationMs: z.number().nullable(),
  }),
  trend: z.object({ runs: z.array(z.object({ runNumber: z.number(), status: z.string(), failed: z.number(), flaky: z.number(), url: z.string() })) }),
  fixFirst: z.array(testRef.extend({ rank: z.number(), impact: z.number(), chronic: z.boolean(), reason: z.string() })),
  flaky: z.array(testRef.extend({ flakyRate: z.number(), runs: z.number() })),
  slowest: z.array(testRef.extend({ p95DurationMs: z.number().nullable() })),
  gettingSlower: z.array(testRef.extend({ durationTrendPct: z.number().nullable(), avgDurationMs: z.number().nullable() })),
  topErrors: z.array(z.object({ signature: z.string(), category: z.string(), message: z.string(), tests: z.number(), runs: z.number() })),
});

export const projectHealth = defineTool({
  name: 'project_health',
  title: 'Project health',
  toolset: 'core',
  description:
    'Where a project stands and what to fix first: run pass rate, reliability, a ranked fix-first list (failures weigh fully, flakes half), flakiest and slowest tests, tests getting slower, and the most widespread errors. Optionally for one branch.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const window = timeWindow(args, { defaultSince: '14d', max: '90d' });
    const scope = args.branch ? { branch: args.branch } : {};
    const id = project.project.id;
    const page = { limit: 30, offset: 0 };
    const base = { since: window.since, branch: args.branch, minRuns: 2 } as const;
    const [stats, trend, failing, flaky, slow, slower, errors] = await Promise.all([
      dashboardStats(id, window.days, scope),
      passFailTrend(id, 20, scope),
      searchTests(id, { ...base, sort: 'failureRate' }, page),
      searchTests(id, { ...base, status: 'flaky', sort: 'flakyRate' }, { limit: 5, offset: 0 }),
      searchTests(id, { ...base, minRuns: 3, sort: 'p95Duration' }, { limit: 5, offset: 0 }),
      searchTests(id, { ...base, minRuns: 6, sort: 'durationTrend' }, { limit: 5, offset: 0 }),
      topErrorSignatures(id, window.since, { branch: args.branch }),
    ]);
    const ref = (t: { testId: string; title: string; titlePath: string[]; file: string; pwProject: string }) => ({
      testId: t.testId,
      title: t.titlePath.length ? t.titlePath.join(' › ') : t.title,
      file: t.file,
      browser: t.pwProject,
      url: project.links.test(t.testId),
    });
    const ranked = rankFixFirst(
      [...failing.rows, ...flaky.rows].map((t) => ({ ...ref(t), runs: t.runs, failed: t.failed, flaky: t.flaky, failureRate: t.failureRate, streak: t.streak, lastOutcome: t.lastOutcome, lastRunAt: t.lastRunAt, lastRunNumber: t.lastRunNumber })),
    );
    const unique = new Map(ranked.map((r) => [r.testId, r]));
    return {
      data: {
        project: project.ref,
        window: window.label,
        branch: args.branch ?? null,
        stats: {
          finishedRuns: stats.finishedRuns,
          runPassRate: stats.runPassRate,
          reliability: stats.reliability,
          reliabilityLabel: stats.reliability === null ? null : reliabilityLabel(stats.reliability).label,
          trackedTests: stats.trackedTests,
          newTests: stats.newTests,
          avgRunDurationMs: stats.avgRunDurationMs === null ? null : Math.round(stats.avgRunDurationMs),
        },
        trend: { runs: trend.map((t) => ({ runNumber: t.runNumber, status: t.status, failed: t.failed, flaky: t.flaky, url: project.links.run(t.runNumber) })) },
        fixFirst: [...unique.values()].map((r) => ({ testId: r.testId, title: r.title, file: r.file, browser: r.browser, url: r.url, rank: r.rank, impact: r.impact, chronic: r.chronic, reason: r.reason })),
        flaky: flaky.rows.map((t) => ({ ...ref(t), flakyRate: t.flakyRate, runs: t.runs })),
        slowest: slow.rows.map((t) => ({ ...ref(t), p95DurationMs: t.p95DurationMs === null ? null : Math.round(t.p95DurationMs) })),
        gettingSlower: slower.rows
          .filter((t) => (t.durationTrend ?? 0) > 0.1)
          .map((t) => ({ ...ref(t), durationTrendPct: t.durationTrend === null ? null : Math.round(t.durationTrend * 100), avgDurationMs: t.avgDurationMs === null ? null : Math.round(t.avgDurationMs) })),
        topErrors: errors.map((e) => ({ signature: e.signature.slice(0, 12), category: categoryOf(e.message) ?? 'other', message: firstLine(e.message, 160), tests: e.tests, runs: e.runs })),
      },
      render(md, d) {
        md.heading(`Health of ${d.project}${d.branch ? ` on ${d.branch}` : ''} (${d.window})`, 2);
        md.kv([
          ['Finished runs', d.stats.finishedRuns],
          ['Run pass rate', pct(d.stats.runPassRate)],
          ['Test reliability', d.stats.reliability === null ? null : `${Math.round(d.stats.reliability)}/100 (${d.stats.reliabilityLabel})`],
          ['Tests tracked', `${d.stats.trackedTests} (${d.stats.newTests} new)`],
          ['Average run', dur(d.stats.avgRunDurationMs)],
          ['Last runs, newest first', d.trend.runs.map((r) => (r.status === 'passed' ? '✓' : r.status === 'failed' || r.status === 'timedout' ? '✗' : '·')).join('') || null],
        ]);
        md.heading('Fix first', 3);
        if (d.fixFirst.length === 0) md.line('Nothing failed or flaked in this window.');
        else md.table(['#', 'Test', 'Why'], d.fixFirst.map((f) => [f.rank, `${link(f.title, f.url)} (${f.file}, ${f.browser})`, f.reason]));
        if (d.topErrors.length) {
          md.heading('Most widespread errors', 3);
          md.table(['Category', 'Error', 'Tests', 'Runs'], d.topErrors.map((e) => [e.category, e.message, e.tests, e.runs]));
        }
        if (d.flaky.length) {
          md.heading('Flakiest', 3);
          md.table(['Test', 'Flaky rate', 'Runs'], d.flaky.map((t) => [link(t.title, t.url), pct(t.flakyRate), t.runs]));
        }
        if (d.slowest.length) {
          md.heading('Slowest (p95 of passing runs)', 3);
          md.table(['Test', 'p95'], d.slowest.map((t) => [link(t.title, t.url), dur(t.p95DurationMs)]));
        }
        if (d.gettingSlower.length) {
          md.heading('Getting slower', 3);
          md.table(['Test', 'Trend', 'Average'], d.gettingSlower.map((t) => [link(t.title, t.url), `+${t.durationTrendPct}%`, dur(t.avgDurationMs)]));
        }
        md.line('Drill in with get_test_history or get_failure_context for any test above.');
      },
    };
  },
});
