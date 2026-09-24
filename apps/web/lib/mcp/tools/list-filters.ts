import { z } from 'zod';
import { defaultBranch, listFacets } from '@/lib/db/queries/mcp';
import { commonParams, sinceParam, timeWindow } from '../params';
import { defineTool, output } from '../registry';
import { when } from '../render/markdown';

const input = z.object({ ...commonParams, since: sinceParam });

const named = <S extends z.ZodRawShape>(extra: S) => z.array(z.object({ name: z.string(), ...extra }));

const outputSchema = output({
  project: z.string(),
  window: z.string(),
  defaultBranch: z.string(),
  branches: named({ runs: z.number(), lastRunAt: z.string() }),
  environments: named({ runs: z.number() }),
  browsers: named({ tests: z.number() }),
  testTags: named({ tests: z.number() }),
  runTags: named({ runs: z.number() }),
  authors: named({ runs: z.number() }),
});

export const listFilters = defineTool({
  name: 'list_filters',
  title: 'List filter values',
  toolset: 'core',
  description:
    'Use before filtering when unsure of exact values. Returns the branches, environments, browser projects, test tags, run tags and commit authors seen in a project recently, plus its base branch.',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const window = timeWindow(args, { defaultSince: '90d', max: '365d' });
    const [facets, base] = await Promise.all([listFacets(project.project.id, window.since), defaultBranch(project.project.id, project.project.settings)]);
    return {
      data: {
        project: project.ref,
        window: window.label,
        defaultBranch: base,
        branches: facets.branches.map((b) => ({ ...b, lastRunAt: b.lastRunAt.toISOString() })),
        environments: facets.environments,
        browsers: facets.browsers,
        testTags: facets.testTags,
        runTags: facets.runTags,
        authors: facets.authors,
      },
      render(md, d) {
        md.heading(`Filter values in ${d.project} (${d.window})`, 2);
        md.kv([['Base branch', d.defaultBranch]]);
        const list = (label: string, items: { name: string; runs?: number; tests?: number }[]) => {
          const count = (i: { runs?: number; tests?: number }) => (i.runs !== undefined ? `${i.runs} runs` : `${i.tests} tests`);
          md.line(`**${label}:** ${items.length ? items.map((i) => `${i.name} (${count(i)})`).join(', ') : 'none'}`);
        };
        list('Environments', d.environments);
        list('Browsers (Playwright projects)', d.browsers);
        list('Test tags', d.testTags);
        list('Run tags', d.runTags);
        list('Authors', d.authors);
        md.heading('Branches, most recent first', 3);
        md.table(
          ['Branch', 'Runs', 'Last run'],
          d.branches.map((b) => [b.name, b.runs, when(b.lastRunAt)]),
        );
      },
    };
  },
});
