import { reliabilityLabel } from '@miguelfranken/ui/lib/reliability';
import { z } from 'zod';
import { searchTests } from '@/lib/db/queries/mcp';
import {
  branchParam,
  browserParam,
  commonParams,
  cursorParam,
  environmentParam,
  limitParam,
  nextCursor,
  readPage,
  sinceParam,
  timeWindow,
} from '../params';
import { defineTool, output } from '../registry';
import { dur, link, pct } from '../render/markdown';

const SORTS = ['flakyRate', 'failureRate', 'reliability', 'avgDuration', 'p95Duration', 'durationTrend', 'runs', 'lastRun'] as const;

const input = z.object({
  ...commonParams,
  search: z.string().optional().describe('Title or file; a regular expression when valid, otherwise a substring.'),
  status: z
    .enum(['flaky', 'chronic', 'failing', 'stable', 'passed', 'skipped'])
    .optional()
    .describe('flaky: flaked at least once · chronic: failing persistently · failing: last result failed · stable: no failures or flakes.'),
  tags: z.array(z.string()).optional().describe('Tests carrying any of these tags.'),
  browser: browserParam,
  environment: environmentParam,
  branch: branchParam,
  since: sinceParam,
  minRuns: z.number().int().min(1).optional().describe('Ignore tests with fewer executions in the window (default 3).'),
  sort: z
    .enum(SORTS)
    .optional()
    .describe('Ranking (default flakyRate). durationTrend = getting slower; reliability sorts least reliable first.'),
  dir: z.enum(['asc', 'desc']).optional().describe('Override the sort direction.'),
  limit: limitParam,
  cursor: cursorParam,
});

const outputSchema = output({
  project: z.string(),
  window: z.string(),
  total: z.number(),
  tests: z.array(
    z.object({
      testId: z.string(),
      title: z.string(),
      file: z.string(),
      browser: z.string(),
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
      lastOutcome: z.string(),
      lastRunNumber: z.number(),
      lastBranch: z.string().nullable(),
      url: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const findTests = defineTool({
  name: 'find_tests',
  title: 'Find tests',
  toolset: 'core',
  description:
    'Rank or search tests across runs: flakiest, most failing, chronic, slowest (p95), getting slower, least reliable — or find a test by title. Filter by tag, browser, environment, branch and window.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const window = timeWindow(args, { defaultSince: '30d', max: '180d' });
    const filters = {
      search: args.search,
      status: args.status,
      tags: args.tags,
      browser: args.browser,
      environment: args.environment,
      branch: args.branch,
      since: window.since,
      minRuns: args.minRuns ?? (args.search ? 1 : 3),
      sort: args.sort ?? (args.search ? 'lastRun' : 'flakyRate'),
      dir: args.dir,
    } as const;
    const cursorFilters = { ...filters, since: args.since ?? null };
    const page = readPage('find_tests', cursorFilters, args);
    const { rows, total } = await searchTests(project.project.id, filters, page);
    return {
      data: {
        project: project.ref,
        window: window.label,
        total,
        tests: rows.map((r) => {
          const nonSkipped = r.runs - r.skipped;
          return {
            testId: r.testId,
            title: r.titlePath.length ? r.titlePath.join(' › ') : r.title,
            file: r.file,
            browser: r.pwProject,
            runs: r.runs,
            passRate: nonSkipped ? r.passed / nonSkipped : 0,
            failureRate: r.failureRate,
            flakyRate: r.flakyRate,
            reliability: r.reliability,
            reliabilityLabel: r.reliability === null ? null : reliabilityLabel(r.reliability).label,
            avgDurationMs: r.avgDurationMs === null ? null : Math.round(r.avgDurationMs),
            p95DurationMs: r.p95DurationMs === null ? null : Math.round(r.p95DurationMs),
            durationTrendPct: r.durationTrend === null ? null : Math.round(r.durationTrend * 100),
            streak: r.streak,
            lastOutcome: r.lastOutcome,
            lastRunNumber: r.lastRunNumber,
            lastBranch: r.lastBranch,
            url: project.links.test(r.testId),
          };
        }),
        nextCursor: nextCursor('find_tests', cursorFilters, page, total),
      },
      render(md, d) {
        md.heading(`Tests in ${d.project} by ${filters.sort} (${d.window}${filters.branch ? `, ${filters.branch}` : ''})`, 2);
        if (window.clamped) md.line('The window was limited to 180 days.');
        if (d.tests.length === 0) {
          md.line(`No tests match (tests need at least ${filters.minRuns} executions in the window; lower "minRuns" or widen "since").`);
          return;
        }
        const shown = md.table(
          ['Test', 'Browser', 'Runs', 'Fail', 'Flaky', 'Reliability', 'Avg', 'p95', 'Trend', 'Last'],
          d.tests.map((t) => [
            `${link(t.title, t.url)} (${t.file})`,
            t.browser,
            t.runs,
            pct(t.failureRate),
            pct(t.flakyRate),
            t.reliability === null ? null : `${t.reliability} ${t.reliabilityLabel}`,
            dur(t.avgDurationMs),
            dur(t.p95DurationMs),
            t.durationTrendPct === null ? null : `${t.durationTrendPct > 0 ? '+' : ''}${t.durationTrendPct}%`,
            `${t.lastOutcome} #${t.lastRunNumber}${t.streak > 1 && ['failed', 'timedout'].includes(t.lastOutcome) ? ` (${t.streak}× in a row)` : ''}`,
          ]),
        );
        md.line('Trend: average passing duration of the newest third of runs against the oldest third.');
        md.notice(`Showing ${page.offset + 1}–${page.offset + shown} of ${d.total}.${d.nextCursor ? ` Next page: cursor "${d.nextCursor}".` : ''}`);
      },
    };
  },
});
