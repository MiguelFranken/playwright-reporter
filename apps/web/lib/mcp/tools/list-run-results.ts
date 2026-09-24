import { z } from 'zod';
import { outcomeCounts, searchRunResults, type Outcome } from '@/lib/db/queries/mcp';
import {
  asList,
  branchParam,
  browserParam,
  commonParams,
  cursorParam,
  environmentParam,
  fileParam,
  limitParam,
  nextCursor,
  oneOrMany,
  readPage,
  runParam,
} from '../params';
import { defineTool, output } from '../registry';
import { STRIP_LEGEND, dur, link, outcomeStrip } from '../render/markdown';
import { firstLine } from '../render/sanitize';
import { resolveRun } from '../resolve';
import { CATEGORY_KEYS, OUTCOMES, PROBLEM_OUTCOMES, categoryOf, runHeadline, toRunSummary } from './shared';

const input = z.object({
  ...commonParams,
  run: runParam.optional(),
  branch: branchParam,
  environment: environmentParam,
  outcome: oneOrMany(z.enum(OUTCOMES))
    .optional()
    .describe('Outcome(s) to list. Default: the problems — failed, timedout, interrupted, flaky. Pass every outcome for all tests.'),
  file: fileParam,
  search: z.string().optional().describe('Part of the test title.'),
  signature: z.string().optional().describe('Error signature (or its prefix) from get_run / summarize_failures.'),
  category: oneOrMany(z.enum(CATEGORY_KEYS)).optional().describe('Failure category: assertion, timeout, locator, network, crash, snapshot, other.'),
  browser: browserParam,
  retried: z.boolean().optional().describe('Only tests that needed a retry (true) or passed/failed on the first attempt (false).'),
  hasArtifacts: z.boolean().optional().describe('Only tests with (true) or without (false) screenshots, traces or videos.'),
  minDurationMs: z.number().int().min(0).optional().describe('Only tests that took at least this long.'),
  sort: z.enum(['outcome', 'file', 'duration']).optional().describe('Order: outcome (failures first, default), file, or duration (slowest first).'),
  limit: limitParam,
  cursor: cursorParam,
});

const outputSchema = output({
  project: z.string(),
  run: z.object({ number: z.number(), status: z.string(), branch: z.string().nullable(), url: z.string() }),
  countsByOutcome: z.record(z.string(), z.number()),
  total: z.number(),
  results: z.array(
    z.object({
      resultId: z.string(),
      testId: z.string(),
      title: z.string(),
      file: z.string(),
      line: z.number(),
      browser: z.string(),
      outcome: z.string(),
      attempts: z.number(),
      durationMs: z.number(),
      error: z.string().nullable(),
      category: z.string().nullable(),
      signature: z.string().nullable(),
      history: z.string(),
      artifacts: z.array(z.string()),
      url: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const listRunResults = defineTool({
  name: 'list_run_results',
  title: 'List run results',
  toolset: 'core',
  description:
    'The tests of one run, failures first. Filter by outcome (default: failed, timed out, interrupted, flaky), file, title, error signature or category, browser, retries, artifacts or duration. Each row has the test’s last 10 outcomes.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const run = await resolveRun(project, args.run, { branch: args.branch, environment: args.environment });
    const outcomes = (asList(args.outcome) ?? [...PROBLEM_OUTCOMES]) as Outcome[];
    const categories = asList(args.category);
    const filters = {
      outcomes,
      file: args.file,
      search: args.search,
      signature: args.signature,
      browser: args.browser,
      retried: args.retried,
      hasArtifacts: args.hasArtifacts,
      minDurationMs: args.minDurationMs,
      sort: args.sort,
    };
    const page = readPage('list_run_results', { run: run.id, ...filters, categories }, args);
    const [all, counts] = await Promise.all([searchRunResults(run.id, filters), outcomeCounts(run.id)]);
    // Categories are derived from the message (not stored), so they filter here; a run is bounded.
    const matching = categories ? all.filter((r) => categories.includes(categoryOf(r.errorMessage) ?? 'other')) : all;
    const slice = matching.slice(page.offset, page.offset + page.limit);
    const summary = toRunSummary(run, project.links);
    return {
      data: {
        project: project.ref,
        run: { number: run.number, status: run.status, branch: run.gitBranch, url: summary.url },
        countsByOutcome: counts,
        total: matching.length,
        results: slice.map((r) => ({
          resultId: r.id,
          testId: r.testId,
          title: r.titlePath.length ? r.titlePath.join(' › ') : r.title,
          file: r.file,
          line: r.line,
          browser: r.pwProject,
          outcome: r.outcome,
          attempts: r.attemptCount,
          durationMs: r.durationMs,
          error: r.errorMessage ? firstLine(r.errorMessage, 200) : null,
          category: categoryOf(r.errorMessage),
          signature: r.errorSignature?.slice(0, 12) ?? null,
          history: outcomeStrip(r.history),
          artifacts: r.attachmentKinds,
          url: project.links.result(run.number, r.id),
        })),
        nextCursor: nextCursor('list_run_results', { run: run.id, ...filters, categories }, page, matching.length),
      },
      render(md, d) {
        md.heading(`Results of run #${d.run.number} in ${d.project}`, 2);
        md.line(runHeadline(summary));
        md.line(`Outcomes: ${Object.entries(d.countsByOutcome).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}. Listing: ${outcomes.join(', ')}${categories ? `; categories ${categories.join(', ')}` : ''}.`);
        if (d.results.length === 0) {
          md.line('No results match these filters.');
          return;
        }
        const shown = md.table(
          ['Test', 'File', 'Browser', 'Outcome', 'Tries', 'Time', 'Error', 'History', 'Artifacts'],
          d.results.map((r) => [
            link(r.title, r.url),
            `${r.file}:${r.line}`,
            r.browser,
            r.outcome,
            r.attempts,
            dur(r.durationMs),
            r.error ? `${r.category}: ${r.error}` : null,
            r.history,
            r.artifacts.join(', '),
          ]),
        );
        md.line(STRIP_LEGEND);
        md.notice(`Showing ${page.offset + 1}–${page.offset + shown} of ${d.total}.${d.nextCursor ? ` Next page: cursor "${d.nextCursor}".` : ''}`);
      },
    };
  },
});
