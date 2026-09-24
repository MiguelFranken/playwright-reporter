import { reliabilityLabel } from '@miguelfranken/ui/lib/reliability';
import { z } from 'zod';
import { branchBreakdown } from '@/lib/db/queries/mcp';
import { getTestOverview } from '@/lib/db/queries/explorer';
import { testHistory } from '@/lib/db/queries/runs';
import { notFound } from '../errors';
import { branchParam, browserParam, commonParams, fileParam, sinceParam, testParam, timeWindow } from '../params';
import { defineTool, output } from '../registry';
import { STRIP_LEGEND, dur, link, outcomeStrip, pct, when } from '../render/markdown';
import { firstLine } from '../render/sanitize';
import { resolveTest } from '../resolve';
import { categoryOf } from './shared';

const input = z.object({
  ...commonParams,
  test: testParam,
  file: fileParam,
  browser: browserParam,
  branch: branchParam.describe('Only executions on this branch for the recent list (stats cover every branch).'),
  since: sinceParam,
  limit: z.number().int().min(1).max(100).optional().describe('Recent executions to list (default 20).'),
});

const rate = z.object({ runs: z.number(), failureRate: z.number(), flakyRate: z.number() });

const outputSchema = output({
  project: z.string(),
  window: z.string(),
  test: z.object({ id: z.string(), title: z.string(), file: z.string(), browser: z.string(), tags: z.array(z.string()), firstSeenAt: z.string(), url: z.string() }),
  stats: z.object({
    runs: z.number(),
    passRate: z.number(),
    failureRate: z.number(),
    flakyRate: z.number(),
    reliability: z.number().nullable(),
    reliabilityLabel: z.string().nullable(),
    avgDurationMs: z.number().nullable(),
    p95DurationMs: z.number().nullable(),
    durationTrendPct: z.number().nullable(),
    streak: z.number(),
    streakKind: z.string(),
    chronic: z.boolean(),
    branchCount: z.number(),
    topFailingBranch: z.string().nullable(),
  }),
  byEnvironment: z.array(rate.extend({ environment: z.string().nullable() })),
  byBranch: z.array(rate.extend({ branch: z.string().nullable(), lastOutcome: z.string() })),
  siblings: z.array(z.object({ testId: z.string(), browser: z.string(), url: z.string() })),
  errors: z.array(z.object({ signature: z.string(), category: z.string(), message: z.string(), count: z.number(), firstSeen: z.string(), lastSeen: z.string(), lastResultUrl: z.string() })),
  recent: z.array(
    z.object({
      runNumber: z.number(),
      startedAt: z.string(),
      branch: z.string().nullable(),
      commit: z.string().nullable(),
      environment: z.string().nullable(),
      outcome: z.string(),
      attempts: z.number(),
      durationMs: z.number(),
      error: z.string().nullable(),
      url: z.string(),
    }),
  ),
});

export const getTestHistory = defineTool({
  name: 'get_test_history',
  title: 'Get test history',
  toolset: 'core',
  description:
    'One test over time: reliability, failure and flaky rate, p95 duration and trend, streak, breakdown by environment and branch, the same test in other browser projects, its distinct errors, and recent executions.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const test = await resolveTest(project, args.test, { file: args.file, browser: args.browser });
    const window = timeWindow(args, { defaultSince: '30d', max: '180d' });
    const [overview, recent, branches] = await Promise.all([
      getTestOverview(project.project.id, test.id, window.days),
      testHistory(test.id, { branch: args.branch, limit: args.limit ?? 20 }),
      branchBreakdown(test.id, window.since),
    ]);
    if (!overview) throw notFound(`Test ${test.id} not found in ${project.ref}.`);
    const s = overview.stats;
    const nonSkipped = s.runs - s.skipped;
    const links = project.links;
    return {
      data: {
        project: project.ref,
        window: window.label,
        test: {
          id: test.id,
          title: test.titlePath.length ? test.titlePath.join(' › ') : test.title,
          file: test.file,
          browser: test.pwProject,
          tags: overview.test.tags,
          firstSeenAt: overview.test.firstSeenAt.toISOString(),
          url: links.test(test.id),
        },
        stats: {
          runs: s.runs,
          passRate: nonSkipped ? s.passed / nonSkipped : 0,
          failureRate: s.failureRate,
          flakyRate: s.flakyRate,
          reliability: s.reliability,
          reliabilityLabel: s.reliability === null ? null : reliabilityLabel(s.reliability).label,
          avgDurationMs: s.avgDurationMs === null ? null : Math.round(s.avgDurationMs),
          p95DurationMs: s.p95DurationMs === null ? null : Math.round(s.p95DurationMs),
          durationTrendPct: s.durationTrend === null ? null : Math.round((s.durationTrend - 1) * 100),
          streak: s.streak,
          streakKind: s.streakKind,
          chronic: s.chronic,
          branchCount: s.branches,
          topFailingBranch: s.topFailingBranch,
        },
        byEnvironment: overview.environments.map((e) => ({ environment: e.environment, runs: e.executions, failureRate: e.failureRate, flakyRate: e.flakyRate })),
        byBranch: branches,
        siblings: overview.siblings.map((sib) => ({ testId: sib.testId, browser: sib.pwProject, url: links.test(sib.testId) })),
        errors: overview.errors.slice(0, 10).map((e) => ({
          signature: e.signature.slice(0, 12),
          category: categoryOf(e.message) ?? 'other',
          message: firstLine(e.message, 200),
          count: e.count,
          firstSeen: e.firstSeen.toISOString(),
          lastSeen: e.lastSeen.toISOString(),
          lastResultUrl: links.result(e.lastRunNumber, e.lastResultId),
        })),
        recent: recent.map((h) => ({
          runNumber: h.runNumber,
          startedAt: h.startedAt.toISOString(),
          branch: h.branch,
          commit: h.gitShortSha,
          environment: h.environment,
          outcome: h.outcome,
          attempts: h.attemptCount,
          durationMs: h.durationMs,
          error: h.errorMessage ? firstLine(h.errorMessage, 160) : null,
          url: links.result(h.runNumber, h.resultId),
        })),
      },
      render(md, d) {
        const st = d.stats;
        md.heading(d.test.title, 2);
        md.line(`${d.test.file} · ${d.test.browser} · ${link('open in app', d.test.url)} · ${d.window}`);
        md.kv([
          ['Executions', st.runs],
          ['Reliability', st.reliability === null ? null : `${st.reliability}/100 (${st.reliabilityLabel})`],
          ['Pass / fail / flaky', `${pct(st.passRate)} / ${pct(st.failureRate)} / ${pct(st.flakyRate)}`],
          ['Duration', `avg ${dur(st.avgDurationMs)}, p95 ${dur(st.p95DurationMs)}${st.durationTrendPct !== null ? `, trend ${st.durationTrendPct > 0 ? '+' : ''}${st.durationTrendPct}%` : ''}`],
          ['Streak', st.streakKind === 'none' ? null : `${st.streak} ${st.streakKind === 'fail' ? 'failures' : 'passes'} in a row`],
          ['Chronic', st.chronic ? 'yes — failing persistently' : null],
          ['Fails most on', st.topFailingBranch],
          ['Other browser projects', d.siblings.length ? d.siblings.map((sib) => link(sib.browser, sib.url)).join(', ') : null],
          ['First seen', when(d.test.firstSeenAt)],
        ]);
        if (d.byEnvironment.length > 1) {
          md.heading('By environment', 3);
          md.table(['Environment', 'Runs', 'Fail', 'Flaky'], d.byEnvironment.map((e) => [e.environment ?? '(none)', e.runs, pct(e.failureRate), pct(e.flakyRate)]));
        }
        if (d.byBranch.length > 1) {
          md.heading('By branch', 3);
          md.table(['Branch', 'Runs', 'Fail', 'Flaky', 'Last'], d.byBranch.map((b) => [b.branch ?? '(none)', b.runs, pct(b.failureRate), pct(b.flakyRate), b.lastOutcome]));
        }
        if (d.errors.length) {
          md.heading('Distinct errors', 3);
          md.table(
            ['Category', 'Error (first line)', 'Times', 'First seen', 'Last seen'],
            d.errors.map((e) => [e.category, link(e.message, e.lastResultUrl), e.count, when(e.firstSeen), when(e.lastSeen)]),
          );
        }
        md.heading(`Recent executions${args.branch ? ` on ${args.branch}` : ''}: ${outcomeStrip(d.recent.map((r) => r.outcome))}`, 3);
        md.line(STRIP_LEGEND);
        md.table(
          ['Run', 'When', 'Branch', 'Commit', 'Outcome', 'Tries', 'Time', 'Error'],
          d.recent.map((r) => [link(`#${r.runNumber}`, r.url), when(r.startedAt), r.branch, r.commit, r.outcome, r.attempts, dur(r.durationMs), r.error]),
        );
      },
    };
  },
});
