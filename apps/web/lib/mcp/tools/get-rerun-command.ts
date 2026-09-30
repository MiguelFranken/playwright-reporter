import { z } from 'zod';
import { findLatestRun, searchRunResults, type Outcome } from '@/lib/db/queries/mcp';
import { rerunCommands, selectionCollisions, selectorHints, type RerunTest } from '../analysis/rerun-command';
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
  style: z
    .enum(['locations', 'titles', 'grep'])
    .optional()
    .describe(
      'Select tests by file:line from the reported run (default), or by "titles": anchored file filters plus a --grep anchored on each test\u2019s file and full title, which survives moved lines. "grep" is the same title selection. Titles are chosen automatically when a line is unknown.',
    ),
  repeat: z.number().int().min(2).max(100).optional().describe('Add --repeat-each=N --retries=0, e.g. to reproduce a flake.'),
  launcher: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe('The command prefix your repository runs Playwright with, used instead of "npx playwright test", e.g. "pnpm test:e2e --". Printed as given.'),
});

const outputSchema = output({
  project: z.string(),
  run: z.object({ number: z.number(), branch: z.string().nullable(), commit: z.string().nullable(), url: z.string() }),
  selected: z.number(),
  commands: z.array(
    z.object({
      browser: z.string(),
      tests: z.number(),
      style: z.enum(['locations', 'titles', 'grep']),
      command: z.string(),
      listCommand: z.string().describe('The same selection with --list: run it first and compare what it lists with `expected` and `tests`.'),
      expected: z.number().describe('How many tests the selection should list.'),
    }),
  ),
  tests: z.array(
    z.object({
      title: z.string(),
      file: z.string(),
      line: z.number(),
      browser: z.string(),
      outcome: z.string(),
      testId: z.string(),
      titlePath: z.array(z.string()).describe('The describe titles and the test title, outermost first.'),
      selector: z.object({
        location: z.string().nullable().describe('file:line from the reported run; the line may have moved in a changed checkout.'),
        file: z.string().describe('Anchored file-filter regex (a positional argument to playwright test).'),
        grep: z.string().describe('Anchored --grep regex that matches only this test in its file.'),
      }),
    }),
  ),
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
    'The exact "npx playwright test …" command that re-runs a run’s failed and/or flaky tests on the same browser projects, one command per project, with a --list preview and the number of tests it should list. Read-only: it prints the command and never starts a run.',
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
    const rerun = (r: (typeof selected)[number]): RerunTest => ({ title: r.title, titlePath: r.titlePath, file: r.file, line: r.line, browser: r.pwProject });
    const commands = rerunCommands(selected.map(rerun), { style: args.style, repeat: args.repeat, launcher: args.launcher });
    const notes = ['Run from the directory of your Playwright config: file paths are relative to it.'];
    if (selected.length) {
      notes.push(
        'Before running, run each listCommand and check that it lists exactly `expected` tests with the titles in `tests`; if it lists more, fewer or others, do not run the command.',
      );
      notes.push(
        `Line numbers come from run #${run.number} and may have moved in a changed checkout; if the --list preview does not match, use "style": "titles".`,
      );
    }
    if (commands.some((c) => c.style !== 'locations') && args.style !== 'titles' && args.style !== 'grep') {
      notes.push('Some tests are selected by title: their line is unknown, or there are too many for locations.');
    }
    notes.push(...selectionCollisions(selected.map(rerun)));
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
        tests: selected.slice(0, 100).map((r) => ({
          title: r.titlePath.join(' › ') || r.title,
          file: r.file,
          line: r.line,
          browser: r.pwProject,
          outcome: r.outcome,
          testId: r.testId,
          titlePath: r.titlePath.length ? r.titlePath : [r.title],
          selector: selectorHints(rerun(r)),
        })),
        notes,
      },
      render(md, d) {
        md.heading(`Re-run ${d.selected} test(s) from ${link(`#${d.run.number}`, d.run.url)}`, 2);
        for (const c of d.commands) {
          md.line(`${c.browser} (${c.tests} test(s), selected by ${c.style}). Preview, should list ${c.expected}:`);
          md.line(`\`\`\`bash\n${c.listCommand}\n\`\`\``);
          md.line('Run:');
          md.line(`\`\`\`bash\n${c.command}\n\`\`\``);
        }
        md.list(d.notes);
        if (d.tests.length) md.table(['Test', 'Location', 'Browser', 'Outcome'], d.tests.map((t) => [t.title, `${t.file}:${t.line}`, t.browser, t.outcome]));
      },
    };
  },
});
