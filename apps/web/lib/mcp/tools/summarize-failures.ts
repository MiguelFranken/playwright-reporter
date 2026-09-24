import { z } from 'zod';
import { defaultBranch, searchRunResults } from '@/lib/db/queries/mcp';
import { signatureNovelty } from '@/lib/db/queries/mcp-analysis';
import { listRunErrorGroups } from '@/lib/db/queries/runs';
import { branchParam, commonParams, environmentParam, runParam } from '../params';
import { defineTool, output } from '../registry';
import { link, when } from '../render/markdown';
import { firstLine } from '../render/sanitize';
import { resolveRun } from '../resolve';
import { categoryOf, countsLine, runHeadline, toRunSummary } from './shared';

const DAY = 86_400_000;

const input = z.object({
  ...commonParams,
  run: runParam.optional().describe('Run to triage (default "latest-failed").'),
  branch: branchParam,
  environment: environmentParam,
  includeFlaky: z.boolean().optional().describe('Include flaky tests in the groups (default true).'),
  limit: z.number().int().min(1).max(50).optional().describe('Groups to return (default 10).'),
});

const outputSchema = output({
  project: z.string(),
  run: z.object({ number: z.number(), status: z.string(), branch: z.string().nullable(), commit: z.string().nullable(), summary: z.string(), url: z.string() }),
  baseBranch: z.string(),
  totals: z.object({ failed: z.number(), flaky: z.number(), groups: z.number(), ungrouped: z.number() }),
  groups: z.array(
    z.object({
      rank: z.number(),
      signature: z.string(),
      category: z.string(),
      message: z.string(),
      tests: z.number(),
      failed: z.number(),
      flaky: z.number(),
      files: z.array(z.string()),
      browsers: z.array(z.string()),
      novelty: z.enum(['new', 'known_on_base', 'recurring']),
      noveltyDetail: z.string(),
      sampleResultUrl: z.string(),
      sampleTests: z.array(z.object({ title: z.string(), url: z.string() })),
    }),
  ),
  ungrouped: z.array(z.object({ title: z.string(), outcome: z.string(), url: z.string() })),
});

export const summarizeFailures = defineTool({
  name: 'summarize_failures',
  title: 'Summarize failures',
  toolset: 'debug',
  description:
    'Triage a red run: its failures grouped by root cause (error signature), largest group first, each with category, affected files and browsers, and whether it is new or already failing on the base branch.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const run = await resolveRun(project, args.run ?? 'latest-failed', { branch: args.branch, environment: args.environment });
    const includeFlaky = args.includeFlaky ?? true;
    const base = await defaultBranch(project.project.id, project.project.settings);
    const [groups, problems] = await Promise.all([
      listRunErrorGroups(run.id),
      searchRunResults(run.id, { outcomes: includeFlaky ? ['failed', 'timedout', 'interrupted', 'flaky'] : ['failed', 'timedout', 'interrupted'] }),
    ]);
    const relevant = groups.filter((g) => g.failed > 0 || (includeFlaky && g.flaky > 0));
    const novelty = await signatureNovelty(
      project.project.id,
      relevant.map((g) => g.signature),
      { runBranch: run.gitBranch, baseBranch: base, since: new Date(run.startedAt.getTime() - 14 * DAY), before: run.startedAt },
    );
    const onBase = run.gitBranch === base;
    const bySignature = new Map<string, typeof problems>();
    for (const p of problems) if (p.errorSignature) bySignature.set(p.errorSignature, [...(bySignature.get(p.errorSignature) ?? []), p]);

    const shaped = relevant.map((g) => {
      const seen = novelty.get(g.signature);
      const members = bySignature.get(g.signature) ?? [];
      let kind: 'new' | 'known_on_base' | 'recurring' = 'new';
      let detail = 'not seen in the 14 days before this run';
      if (!onBase && seen?.onBase) {
        kind = 'known_on_base';
        detail = `also failing on ${base} (${seen.onBase} run(s) in 14 days)`;
      } else if (seen && (onBase ? seen.onBase : seen.onBranch)) {
        kind = 'recurring';
        detail = `seen in ${onBase ? seen.onBase : seen.onBranch} earlier run(s) on ${run.gitBranch ?? 'this branch'} since ${when(seen.firstSeen)}`;
      }
      return {
        signature: g.signature.slice(0, 12),
        category: categoryOf(g.message) ?? 'other',
        message: firstLine(g.message, 200),
        tests: g.failed + (includeFlaky ? g.flaky : 0),
        failed: g.failed,
        flaky: g.flaky,
        files: g.files.slice(0, 8),
        browsers: [...new Set(members.map((m) => m.pwProject))],
        novelty: kind,
        noveltyDetail: detail,
        sampleResultUrl: project.links.result(run.number, g.sampleResultId),
        sampleTests: members.slice(0, 3).map((m) => ({ title: m.titlePath.join(' › ') || m.title, url: project.links.result(run.number, m.id) })),
      };
    });
    const order = { new: 0, recurring: 1, known_on_base: 2 };
    shaped.sort((a, b) => b.tests - a.tests || order[a.novelty] - order[b.novelty]);
    const limit = args.limit ?? 10;
    const ungrouped = problems.filter((p) => !p.errorSignature);
    const summary = toRunSummary(run, project.links);
    return {
      data: {
        project: project.ref,
        run: { number: run.number, status: run.status, branch: run.gitBranch, commit: summary.commit, summary: countsLine(run.counts), url: summary.url },
        baseBranch: base,
        totals: { failed: run.counts.failed + run.counts.interrupted, flaky: run.counts.flaky, groups: shaped.length, ungrouped: ungrouped.length },
        groups: shaped.slice(0, limit).map((g, i) => ({ rank: i + 1, ...g })),
        ungrouped: ungrouped.slice(0, 20).map((u) => ({ title: u.titlePath.join(' › ') || u.title, outcome: u.outcome, url: project.links.result(run.number, u.id) })),
      },
      render(md, d) {
        md.heading(`Triage of run #${d.run.number} in ${d.project}`, 2);
        md.line(runHeadline(summary));
        md.line(`${d.run.summary}. ${d.totals.groups} distinct failure(s)${d.totals.ungrouped ? ` plus ${d.totals.ungrouped} without an error message` : ''}. Compared against ${d.baseBranch}.`);
        if (d.groups.length === 0) md.line('No failures with an error in this run.');
        for (const g of d.groups) {
          md.heading(`${g.rank}. ${g.category}: ${g.tests} test(s) — ${g.novelty.replace(/_/g, ' ')}`, 3);
          md.untrusted('Error', g.message, 300);
          md.kv([
            ['Novelty', g.noveltyDetail],
            ['Files', g.files.join(', ')],
            ['Browsers', g.browsers.join(', ') || null],
            ['Failed / flaky', `${g.failed} / ${g.flaky}`],
            ['Examples', g.sampleTests.map((t) => link(t.title, t.url)).join('; ')],
            ['Signature', g.signature],
          ]);
        }
        if (d.totals.groups > d.groups.length) md.notice(`Showing ${d.groups.length} of ${d.totals.groups} groups; raise "limit" for more.`);
        if (d.ungrouped.length) {
          md.heading('Without an error message', 3);
          md.list(d.ungrouped.map((u) => `${link(u.title, u.url)} (${u.outcome})`));
        }
        md.line('Fix the largest new group first. For one test: get_failure_context. For the tests of a group: list_run_results with "signature".');
      },
    };
  },
});
