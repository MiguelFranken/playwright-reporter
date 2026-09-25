import { z } from 'zod';
import { searchRuns } from '@/lib/db/queries/mcp';
import {
  asList,
  branchParam,
  commonParams,
  cursorParam,
  environmentParam,
  limitParam,
  nextCursor,
  oneOrMany,
  readPage,
  sinceParam,
  timeWindow,
  untilParam,
} from '../params';
import { invalid } from '../errors';
import { defineTool, output } from '../registry';
import { dur, link, when } from '../render/markdown';
import { RUN_STATUSES, runSummarySchema, toRunSummary } from './shared';

const input = z.object({
  ...commonParams,
  status: oneOrMany(z.enum(RUN_STATUSES)).optional().describe('Run status(es). "incomplete" includes abandoned runs.'),
  branch: branchParam,
  pullRequest: z
    .union([z.number().int().min(1), z.string().regex(/^[#!]?\d+$/)])
    .optional()
    .describe('Pull or merge request number, e.g. 42, "#42" or GitLab\'s "!1524".'),
  environment: environmentParam,
  author: z.string().optional().describe('Part of the commit author name.'),
  commit: z.string().optional().describe('Commit SHA prefix (at least 4 characters).'),
  tag: z.string().optional().describe('A run tag.'),
  executor: z.enum(['ci', 'local']).optional().describe('Runs from CI or from a laptop.'),
  search: z.string().optional().describe('Text in the commit message, or a run number.'),
  since: sinceParam,
  until: untilParam,
  sort: z.enum(['newest', 'oldest', 'slowest', 'fastest']).optional().describe('Order (default newest).'),
  limit: limitParam,
  cursor: cursorParam,
});

const outputSchema = output({
  project: z.string(),
  window: z.string(),
  total: z.number(),
  runs: z.array(runSummarySchema),
  nextCursor: z.string().nullable(),
});

export const listRuns = defineTool({
  name: 'list_runs',
  title: 'List runs',
  toolset: 'core',
  description:
    'Find test runs. Filter by status, branch, pull request, environment, author, commit, tag, CI vs local and time window; newest first. Each run carries its pass/fail/flaky counts and a link.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    if (args.commit && args.commit.trim().length < 4) throw invalid('"commit" needs at least 4 characters of the SHA.');
    const window = timeWindow(args, { defaultSince: '30d', max: '365d' });
    const filters = {
      statuses: asList(args.status),
      branch: args.branch,
      prNumber: args.pullRequest === undefined ? undefined : Number(String(args.pullRequest).replace(/^[#!]/, '')),
      environment: args.environment,
      author: args.author,
      commit: args.commit?.trim(),
      tag: args.tag,
      executor: args.executor,
      search: args.search,
      since: window.since,
      until: window.until,
      sort: args.sort,
    };
    const cursorFilters = { ...filters, since: args.since ?? null, until: args.until ?? null };
    const page = readPage('list_runs', cursorFilters, args);
    const { rows, total } = await searchRuns(project.project.id, filters, page);
    const runs = rows.map((r) => toRunSummary(r, project.links));
    return {
      data: { project: project.ref, window: window.label, total, runs, nextCursor: nextCursor('list_runs', cursorFilters, page, total) },
      render(md, d) {
        md.heading(`Runs in ${d.project} (${d.window})`, 2);
        if (d.runs.length === 0) {
          md.line('No runs match. Widen "since" or drop a filter; list_filters shows valid values.');
          return;
        }
        const shown = md.table(
          ['Run', 'Status', 'Branch', 'Commit', 'Tests', 'Failed', 'Flaky', 'Duration', 'Env', 'Started'],
          d.runs.map((r) => [
            link(`#${r.number}`, r.url),
            r.status,
            r.branch,
            [r.commit, r.message].filter(Boolean).join(' '),
            r.counts.total,
            r.counts.failed,
            r.counts.flaky,
            dur(r.durationMs),
            r.environment,
            when(r.startedAt),
          ]),
        );
        const from = page.offset + 1;
        md.notice(
          `Showing runs ${from}–${page.offset + shown} of ${d.total}.${d.nextCursor ? ` Next page: cursor "${d.nextCursor}".` : ''}`,
        );
      },
    };
  },
});
