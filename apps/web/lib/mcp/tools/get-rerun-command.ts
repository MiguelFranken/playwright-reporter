import { z } from 'zod';
import { findLatestRun, searchRunResults, type Outcome } from '@/lib/db/queries/mcp';
import { rerunCommands } from '../analysis/rerun-command';
import { invalid } from '../errors';
import { browserParam, commonParams, isUuid, runParam } from '../params';
import { defineTool, output } from '../registry';
import { link } from '../render/markdown';
import { resolveRun } from '../resolve';

const input = z.object({
  ...commonParams,
  run: runParam.optional().describe('Run whose tests to re-run (default "latest-failed").'),
  scope: z.enum(['failed', 'flaky', 'failed-and-flaky']).optional().describe('Which tests (default failed, which includes timed out).'),
  tests: z.array(z.string()).optional().describe('Exactly these test or result ids of the run; overrides scope.'),
  browser: browserParam,
  style: z.enum(['locations', 'grep']).optional().describe('Select tests by file:line (default) or by --grep on titles.'),
  repeat: z.number().int().min(2).max(100).optional().describe('Add --repeat-each=N --retries=0, e.g. to reproduce a flake.'),
});

const outputSchema = output({
  project: z.string(),
  run: z.object({ number: z.number(), branch: z.string().nullable(), commit: z.string().nullable(), url: z.string() }),
  selected: z.number(),
  commands: z.array(z.object({ browser: z.string(), tests: z.number(), style: z.enum(['locations', 'grep']), command: z.string() })),
  tests: z.array(z.object({ title: z.string(), file: z.string(), line: z.number(), browser: z.string(), outcome: z.string() })),
  notes: z.array(z.string()),
});

const SCOPES: Record<string, Outcome[]> = {
  failed: ['failed', 'timedout', 'interrupted'],
  flaky: ['flaky'],
  'failed-and-flaky': ['failed', 'timedout', 'interrupted', 'flaky'],
};

export const getRerunCommand = defineTool({
  name: 'get_rerun_command',
  title: 'Get re-run command',
  toolset: 'debug',
  description:
    'The exact "npx playwright test …" command that re-runs a run’s failed and/or flaky tests on the same browser projects, one command per project. Read-only: it prints the command and never starts a run.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const run = await resolveRun(project, args.run ?? 'latest-failed');
    const outcomes = args.tests ? undefined : SCOPES[args.scope ?? 'failed'];
    if (args.tests?.some((t) => !isUuid(t))) throw invalid('"tests" takes test or result ids (from list_run_results).');
    const all = await searchRunResults(run.id, { outcomes, browser: args.browser, sort: 'file' });
    const wanted = args.tests ? new Set(args.tests.map((t) => t.toLowerCase())) : null;
    const selected = wanted ? all.filter((r) => wanted.has(r.id) || wanted.has(r.testId)) : all;
    const commands = rerunCommands(
      selected.map((r) => ({ title: r.title, file: r.file, line: r.line, browser: r.pwProject })),
      { style: args.style, repeat: args.repeat },
    );
    const notes = ['Run from the directory of your Playwright config: file paths are relative to it.'];
    const latestOnBranch = run.gitBranch ? await findLatestRun(project.project.id, { branch: run.gitBranch }) : null;
    if (run.gitSha && latestOnBranch && latestOnBranch.gitSha !== run.gitSha) {
      notes.push(`Run #${run.number} tested commit ${run.gitShortSha ?? run.gitSha.slice(0, 7)}; ${run.gitBranch} has moved on. To reproduce exactly: git checkout ${run.gitSha}`);
    }
    if ((args.scope === 'flaky' || args.scope === 'failed-and-flaky') && !args.repeat) notes.push('To reproduce a flake, add "repeat": 10 (adds --repeat-each=10 --retries=0).');
    if (selected.length === 0) notes.push('No tests matched, so there is nothing to re-run.');
    return {
      data: {
        project: project.ref,
        run: { number: run.number, branch: run.gitBranch, commit: run.gitShortSha, url: project.links.run(run.number) },
        selected: selected.length,
        commands,
        tests: selected.slice(0, 100).map((r) => ({ title: r.titlePath.join(' › ') || r.title, file: r.file, line: r.line, browser: r.pwProject, outcome: r.outcome })),
        notes,
      },
      render(md, d) {
        md.heading(`Re-run ${d.selected} test(s) from ${link(`#${d.run.number}`, d.run.url)}`, 2);
        for (const c of d.commands) {
          md.line(`${c.browser} (${c.tests} test(s)):`);
          md.line(`\`\`\`bash\n${c.command}\n\`\`\``);
        }
        md.list(d.notes);
        if (d.tests.length) md.table(['Test', 'Location', 'Browser', 'Outcome'], d.tests.map((t) => [t.title, `${t.file}:${t.line}`, t.browser, t.outcome]));
      },
    };
  },
});
