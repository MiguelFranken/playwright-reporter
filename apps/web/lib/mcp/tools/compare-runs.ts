import { z } from 'zod';
import { defaultBranch, findLatestRun, type McpRun } from '@/lib/db/queries/mcp';
import { diffRunRows } from '@/lib/db/queries/mcp-analysis';
import { diffRuns, type DiffRow } from '../analysis/run-diff';
import { notFound } from '../errors';
import { branchParam, commonParams, environmentParam, runParam } from '../params';
import { defineTool, output } from '../registry';
import { dur, link, pct } from '../render/markdown';
import { firstLine } from '../render/sanitize';
import { resolveRun } from '../resolve';
import { categoryOf, runHeadline, runSummarySchema, toRunSummary } from './shared';

const input = z.object({
  ...commonParams,
  base: runParam.optional().describe('The earlier run (default: latest finished run on the base branch before head).'),
  head: runParam.optional().describe('The later run (default: latest finished run on "branch", or on the base run’s branch).'),
  branch: branchParam.describe('Branch mode: compare the latest run of this branch against the base branch.'),
  baseBranch: z.string().optional().describe('Branch to compare against (default: the project’s base branch).'),
  environment: environmentParam,
  limit: z.number().int().min(1).max(100).optional().describe('Rows per bucket (default 20).'),
});

const change = z.object({
  testId: z.string(),
  title: z.string(),
  file: z.string(),
  browser: z.string(),
  baseOutcome: z.string().nullable(),
  headOutcome: z.string().nullable(),
  error: z.string().nullable(),
  category: z.string().nullable(),
  sameError: z.boolean().nullable(),
  baseMs: z.number().nullable(),
  headMs: z.number().nullable(),
  url: z.string().nullable(),
});

const outputSchema = output({
  project: z.string(),
  mode: z.enum(['explicit', 'branch']),
  base: runSummarySchema,
  head: runSummarySchema,
  summary: z.object({
    newFailures: z.number(),
    fixed: z.number(),
    newFlaky: z.number(),
    stillFailing: z.number(),
    added: z.number(),
    removed: z.number(),
    slower: z.number(),
    passRateDelta: z.number().nullable(),
    durationDeltaMs: z.number().nullable(),
  }),
  newFailures: z.array(change),
  fixed: z.array(change),
  newFlaky: z.array(change),
  stillFailing: z.array(change),
  added: z.array(change),
  removed: z.array(change),
  slower: z.array(change),
});

const passRate = (r: McpRun) => {
  const counted = r.counts.total - r.counts.skipped;
  return counted ? (r.counts.passed + r.counts.flaky) / counted : null;
};

export const compareRuns = defineTool({
  name: 'compare_runs',
  title: 'Compare runs',
  toolset: 'debug',
  description:
    'What changed between two runs, or between a branch and its base branch: new failures, fixed tests, new flakes, still failing (same or different error), added and removed tests, and tests that got much slower.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const baseBranchName = args.baseBranch ?? (await defaultBranch(project.project.id, project.project.settings));
    let head: McpRun;
    let base: McpRun | null;
    const mode: 'explicit' | 'branch' = args.base !== undefined && args.head !== undefined ? 'explicit' : 'branch';
    if (args.head !== undefined) head = await resolveRun(project, args.head);
    else if (args.base !== undefined && !args.branch) {
      const b = await resolveRun(project, args.base);
      const latest = await findLatestRun(project.project.id, { branch: b.gitBranch ?? undefined, environment: args.environment, finishedOnly: true, after: b.startedAt });
      if (!latest) throw notFound(`No finished run on ${b.gitBranch ?? 'that branch'} after #${b.number}.`);
      head = latest;
    } else {
      const latest = await findLatestRun(project.project.id, { branch: args.branch ?? baseBranchName, environment: args.environment, finishedOnly: true });
      if (!latest) throw notFound(`No finished run on ${args.branch ?? baseBranchName} in ${project.ref}.`, 'Call list_filters for branch names.');
      head = latest;
    }
    if (args.base !== undefined) base = await resolveRun(project, args.base);
    else {
      const sameBranch = head.gitBranch === baseBranchName;
      const scope = { branch: baseBranchName, finishedOnly: true, before: head.startedAt };
      base = (await findLatestRun(project.project.id, { ...scope, environment: head.environment ?? undefined })) ?? (await findLatestRun(project.project.id, scope));
      if (!base) {
        throw notFound(
          sameBranch ? `No earlier finished run on ${baseBranchName} to compare #${head.number} with.` : `No finished run on ${baseBranchName} before #${head.number}.`,
          'Pass "base" explicitly.',
        );
      }
    }

    const rows = await diffRunRows(base.id, head.id);
    const buckets = diffRuns(rows);
    const limit = args.limit ?? 20;
    const shape = (r: DiffRow) => ({
      testId: r.testId,
      title: r.title,
      file: r.file,
      browser: r.browser,
      baseOutcome: r.baseOutcome,
      headOutcome: r.headOutcome,
      error: r.headError ? firstLine(r.headError, 160) : null,
      category: categoryOf(r.headError),
      sameError: r.baseSignature && r.headSignature ? r.baseSignature === r.headSignature : null,
      baseMs: r.baseMs,
      headMs: r.headMs,
      url: r.headResultId ? project.links.result(head.number, r.headResultId) : null,
    });
    const b = toRunSummary(base, project.links);
    const h = toRunSummary(head, project.links);
    const baseRate = passRate(base);
    const headRate = passRate(head);
    return {
      data: {
        project: project.ref,
        mode,
        base: b,
        head: h,
        summary: {
          newFailures: buckets.newFailure.length,
          fixed: buckets.fixed.length,
          newFlaky: buckets.newFlaky.length,
          stillFailing: buckets.stillFailing.length,
          added: buckets.added.length,
          removed: buckets.removed.length,
          slower: buckets.slower.length,
          passRateDelta: baseRate !== null && headRate !== null ? headRate - baseRate : null,
          durationDeltaMs: base.durationMs !== null && head.durationMs !== null ? head.durationMs - base.durationMs : null,
        },
        newFailures: buckets.newFailure.slice(0, limit).map(shape),
        fixed: buckets.fixed.slice(0, limit).map(shape),
        newFlaky: buckets.newFlaky.slice(0, limit).map(shape),
        stillFailing: buckets.stillFailing.slice(0, limit).map(shape),
        added: buckets.added.slice(0, limit).map(shape),
        removed: buckets.removed.slice(0, limit).map(shape),
        slower: buckets.slower.slice(0, limit).map(shape),
      },
      render(md, d) {
        md.heading(`#${d.base.number} → #${d.head.number} in ${d.project}`, 2);
        md.line(`Base: ${runHeadline(d.base)}`);
        md.line(`Head: ${runHeadline(d.head)}`);
        const s = d.summary;
        md.kv([
          ['New failures', s.newFailures],
          ['Fixed', s.fixed],
          ['New flaky', s.newFlaky],
          ['Still failing', s.stillFailing],
          ['Added / removed tests', `${s.added} / ${s.removed}`],
          ['Much slower', s.slower],
          ['Pass rate', s.passRateDelta === null ? null : `${s.passRateDelta >= 0 ? '+' : ''}${pct(s.passRateDelta, 1)}`],
          ['Duration', s.durationDeltaMs === null ? null : `${s.durationDeltaMs >= 0 ? '+' : '−'}${dur(Math.abs(s.durationDeltaMs))}`],
        ]);
        const section = (title: string, list: z.infer<typeof change>[], total: number, cols: 'error' | 'time' | 'plain') => {
          if (!list.length) return;
          md.heading(`${title} (${total})`, 3);
          if (cols === 'time') md.table(['Test', 'Browser', 'Before', 'After'], list.map((r) => [link(r.title, r.url), r.browser, dur(r.baseMs), dur(r.headMs)]));
          else if (cols === 'error')
            md.table(
              ['Test', 'Browser', 'Was', 'Error'],
              list.map((r) => [link(r.title, r.url), r.browser, r.baseOutcome ?? 'new test', r.error ? `${r.category}: ${r.error}${r.sameError === false ? ' (different error than before)' : ''}` : null]),
            );
          else md.table(['Test', 'File', 'Browser'], list.map((r) => [link(r.title, r.url), r.file, r.browser]));
          if (total > list.length) md.notice(`${title}: showing ${list.length} of ${total}; raise "limit" for more.`);
        };
        section('New failures', d.newFailures, s.newFailures, 'error');
        section('New flaky', d.newFlaky, s.newFlaky, 'error');
        section('Still failing', d.stillFailing, s.stillFailing, 'error');
        section('Fixed', d.fixed, s.fixed, 'plain');
        section('Much slower (≥1.5× and ≥1 s)', d.slower, s.slower, 'time');
        section('Added', d.added, s.added, 'plain');
        section('Removed', d.removed, s.removed, 'plain');
        if (s.newFailures + s.newFlaky + s.stillFailing + s.fixed + s.slower + s.added + s.removed === 0) md.line('No differences in outcome between the two runs.');
      },
    };
  },
});
