import { z } from 'zod';
import { runNeighbours } from '@/lib/db/queries/mcp';
import { getRunByNumber, listRunErrorGroups, listRunSpecs } from '@/lib/db/queries/runs';
import { isStale } from '@/lib/runs/staleness';
import { branchParam, commonParams, environmentParam, runParam } from '../params';
import { defineTool, output } from '../registry';
import { dur, link, when } from '../render/markdown';
import { firstLine } from '../render/sanitize';
import { resolveRun } from '../resolve';
import { categoryOf, countsLine, runHeadline, runSummarySchema, toRunSummary } from './shared';

const INCLUDE = ['failures', 'specs', 'shards', 'metadata'] as const;

const input = z.object({
  ...commonParams,
  run: runParam.optional(),
  branch: branchParam,
  environment: environmentParam,
  include: z.array(z.enum(INCLUDE)).optional().describe('Extra sections: failures (default), specs, shards, metadata.'),
});

const outputSchema = output({
  project: z.string(),
  run: runSummarySchema.extend({
    statusNote: z.string().nullable(),
    finishedAt: z.string().nullable(),
    ciProvider: z.string().nullable(),
    ciJob: z.string().nullable(),
    playwrightVersion: z.string().nullable(),
    workers: z.number().nullable(),
    shardTotal: z.number(),
  }),
  failureGroups: z.array(
    z.object({
      signature: z.string(),
      category: z.string(),
      message: z.string(),
      tests: z.number(),
      failed: z.number(),
      flaky: z.number(),
      files: z.array(z.string()),
      sampleResultUrl: z.string(),
    }),
  ),
  specs: z.array(z.object({ file: z.string(), total: z.number(), failed: z.number(), flaky: z.number(), durationMs: z.number() })).optional(),
  shards: z.array(z.object({ index: z.number(), status: z.string(), durationMs: z.number().nullable(), hostname: z.string().nullable() })).optional(),
  metadata: z.object({ system: z.record(z.string(), z.unknown()), playwrightProjects: z.array(z.string()) }).optional(),
  neighbours: z.object({ previousOnBranch: z.number().nullable(), nextOnBranch: z.number().nullable() }),
});

export const getRun = defineTool({
  name: 'get_run',
  title: 'Get run',
  toolset: 'core',
  description:
    'One run in detail: status, git and CI context, counts, the top failure groups by error signature and, on request, slowest specs, shards and system metadata. Run can be "#128", "latest" or "latest-failed".',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const resolved = await resolveRun(project, args.run, { branch: args.branch, environment: args.environment });
    const include = new Set(args.include ?? ['failures']);
    const [full, groups, specs, neighbours] = await Promise.all([
      getRunByNumber(project.project.id, resolved.number),
      include.has('failures') ? listRunErrorGroups(resolved.id) : Promise.resolve([]),
      include.has('specs') ? listRunSpecs(resolved.id) : Promise.resolve([]),
      runNeighbours(project.project.id, resolved),
    ]);
    const summary = toRunSummary(resolved, project.links);
    const stale = resolved.status === 'incomplete' && full && isStale(full);
    const data: z.infer<typeof outputSchema> = {
      project: project.ref,
      run: {
        ...summary,
        statusNote:
          resolved.endReason === 'stale' || stale
            ? `Abandoned: the reporter stopped sending events at ${when(resolved.lastEventAt)}; results after that were never reported.`
            : resolved.status === 'running'
              ? 'Still running; counts are partial.'
              : null,
        finishedAt: resolved.finishedAt?.toISOString() ?? null,
        ciProvider: resolved.ciProvider,
        ciJob: resolved.ciJob,
        playwrightVersion: resolved.playwright?.version ?? null,
        workers: resolved.playwright?.workers ?? null,
        shardTotal: resolved.shardTotal,
      },
      failureGroups: groups.slice(0, 10).map((g) => ({
        signature: g.signature.slice(0, 12),
        category: categoryOf(g.message) ?? 'other',
        message: firstLine(g.message, 200),
        tests: g.count,
        failed: g.failed,
        flaky: g.flaky,
        files: g.files.slice(0, 5),
        sampleResultUrl: project.links.result(resolved.number, g.sampleResultId),
      })),
      neighbours: { previousOnBranch: neighbours.previous, nextOnBranch: neighbours.next },
    };
    if (include.has('specs')) {
      const failing = specs.filter((s) => s.failed + s.flaky > 0);
      const slowest = [...specs].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10);
      const pick = [...new Map([...failing, ...slowest].map((s) => [s.file, s])).values()];
      data.specs = pick.map((s) => ({ file: s.file, total: s.total, failed: s.failed, flaky: s.flaky, durationMs: s.durationMs }));
    }
    if (include.has('shards')) {
      data.shards = (full?.shards ?? []).map((s) => ({ index: s.shardIndex, status: s.status, durationMs: s.durationMs, hostname: s.hostname }));
    }
    if (include.has('metadata')) {
      data.metadata = {
        system: (resolved.system ?? {}) as Record<string, unknown>,
        playwrightProjects: (resolved.playwright?.projects ?? []).map((p) => p.name),
      };
    }
    return {
      data,
      render(md, d) {
        const r = d.run;
        md.heading(`Run #${r.number} in ${d.project}`, 2);
        md.line(runHeadline(r));
        if (r.statusNote) md.line(`> ${r.statusNote}`);
        md.kv([
          ['Result', countsLine(r.counts)],
          ['Commit', r.commit ? `${link(r.commit, r.commitUrl)}${r.message ? ` — ${r.message}` : ''}` : null],
          ['Author', r.author],
          ['Pull request', r.prNumber ? link(`#${r.prNumber}`, r.prUrl) : null],
          ['CI', [r.ciProvider, r.ciJob].filter(Boolean).join(' · ') + (r.ciBuildUrl ? ` (${link('build', r.ciBuildUrl)})` : '') || null],
          ['Executor', r.executor],
          ['Tags', r.tags.length ? r.tags.join(', ') : null],
          ['Playwright', r.playwrightVersion ? `${r.playwrightVersion}${r.workers ? `, ${r.workers} workers` : ''}` : null],
          ['Shards', r.shardTotal > 1 ? r.shardTotal : null],
          ['Previous / next on branch', [d.neighbours.previousOnBranch, d.neighbours.nextOnBranch].map((n) => (n ? `#${n}` : '–')).join(' / ')],
        ]);
        if (include.has('failures')) {
          md.heading('Failures by root cause', 3);
          if (d.failureGroups.length === 0) md.line('No test in this run reported an error.');
          else {
            md.table(
              ['#', 'Category', 'Error (first line)', 'Tests', 'Failed', 'Flaky', 'Files'],
              d.failureGroups.map((g, i) => [link(String(i + 1), g.sampleResultUrl), g.category, g.message, g.tests, g.failed, g.flaky, g.files.join(', ')]),
            );
            md.line('For a triage with novelty per group call summarize_failures; for one test call get_failure_context.');
          }
        }
        if (d.specs) {
          md.heading('Specs (failing and slowest)', 3);
          md.table(['File', 'Tests', 'Failed', 'Flaky', 'Duration'], d.specs.map((s) => [s.file, s.total, s.failed, s.flaky, dur(s.durationMs)]));
        }
        if (d.shards) {
          md.heading('Shards', 3);
          md.table(['Shard', 'Status', 'Duration', 'Host'], d.shards.map((s) => [s.index, s.status, dur(s.durationMs), s.hostname]));
        }
        if (d.metadata) {
          md.heading('Metadata', 3);
          md.kv([
            ['Playwright projects', d.metadata.playwrightProjects.join(', ') || null],
            ...Object.entries(d.metadata.system).map(([k, v]): [string, string] => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]),
          ]);
        }
      },
    };
  },
});
