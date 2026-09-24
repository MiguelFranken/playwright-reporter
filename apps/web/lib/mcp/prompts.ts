/**
 * MCP prompts: slash commands in clients that support them. A prompt carries
 * scope only — which project, run or test — never data, so a saved one never
 * goes stale; the tools fetch the data when it runs.
 */
import { completable, type McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { listFacets } from '@/lib/db/queries/mcp';
import type { ToolContext } from './context';

export interface PromptDef {
  name: string;
  title: string;
  description: string;
  args: z.ZodObject;
  text(args: Record<string, string | undefined>): string;
}

const project = z.string().optional().describe('Project as "team/project". Optional with a default project.');
const scope = (a: Record<string, string | undefined>) => (a.project ? ` in ${a.project}` : '');

export const PROMPTS: PromptDef[] = [
  {
    name: 'triage_run',
    title: 'Triage a run',
    description: 'Group a red run’s failures by root cause and get an ordered fix list, noting which failures are new.',
    args: z.object({ project, run: z.string().optional().describe('Run, e.g. "#128" (default: the latest failed run).') }),
    text: (a) =>
      `Triage run ${a.run ?? 'latest-failed'}${scope(a)} with the playwright-reporter tools. Call summarize_failures${a.run ? ` with run "${a.run}"` : ''}. For each failure group, largest first, give the probable cause and a concrete fix, and say whether the group is new or already failing on the base branch. For groups that need a closer look, call get_failure_context on one test of the group. End with a prioritised list.`,
  },
  {
    name: 'debug_test',
    title: 'Debug a failing test',
    description: 'Find out why one test fails and what change fixes it, then how to confirm the fix.',
    args: z.object({
      project,
      test: z.string().describe('Test title, id or URL.'),
      run: z.string().optional().describe('Run the failure happened in (default: its latest failure).'),
    }),
    text: (a) =>
      `Debug the test "${a.test}"${a.run ? ` in run ${a.run}` : ''}${scope(a)} with the playwright-reporter tools. Call get_failure_context first. If the failure is visual or a locator problem, look at the screenshot or diff with get_artifact. Do not propose fixes the evidence rules out. Read the test code in this workspace, propose a concrete code change, and remind me to run verify_fix with the failing run as baseline after the next CI run.`,
  },
  {
    name: 'investigate_flake',
    title: 'Investigate a flaky test',
    description: 'Decide whether a test is flaky or broken, classify the defect, and propose a stabilisation.',
    args: z.object({ project, test: z.string().describe('Test title, id or URL.') }),
    text: (a) =>
      `Is the test "${a.test}"${scope(a)} flaky or broken? Use the playwright-reporter tools: call check_flakiness, then get_failure_context on its latest failure. Classify the problem as a timing, isolation, environment or logic defect from the evidence, read the test code in this workspace, and propose a stabilisation the evidence does not rule out. Offer the get_rerun_command with "repeat" to reproduce it locally.`,
  },
  {
    name: 'branch_check',
    title: 'Check a branch before merging',
    description: 'Compare a branch’s latest run with the base branch and get a go / no-go.',
    args: z.object({ project, branch: z.string().describe('The branch to check.') }),
    text: (a) =>
      `Compare the branch "${a.branch}"${scope(a)} against the base branch with the playwright-reporter tools: call compare_runs with branch "${a.branch}". Summarise new failures, new flakes, fixes and slowdowns, call get_failure_context for any new failure that is not obvious, and give a go / no-go with reasons.`,
  },
];

/**
 * Registers the prompts with argument completion for `project` and `branch`.
 * Completion needs the caller's projects, so these schemas are built per
 * server; there are four prompts, so the conversion cost is negligible.
 */
export function registerPrompts(server: McpServer, ctx: ToolContext) {
  const projectRefs = async (value: string) =>
    (await ctx.accessibleProjects()).map((p) => `${p.team.slug}/${p.project.slug}`).filter((ref) => ref.startsWith(value ?? '')).slice(0, 50);
  const branches = async (value: string, context?: { arguments?: Record<string, string> }) => {
    try {
      const resolved = await ctx.project(context?.arguments?.project);
      const facets = await listFacets(resolved.project.id, new Date(Date.now() - 90 * 86_400_000));
      return facets.branches.map((b) => b.name).filter((b) => b.startsWith(value ?? '')).slice(0, 50);
    } catch {
      return [];
    }
  };
  for (const prompt of PROMPTS) {
    const shape = { ...prompt.args.shape } as Record<string, z.ZodType>;
    if (shape.project) shape.project = completable(z.string().describe(String(shape.project.description ?? 'Project')), projectRefs).optional();
    if (shape.branch) shape.branch = completable(z.string().describe(String(shape.branch.description ?? 'Branch')), branches as never);
    server.registerPrompt(prompt.name, { title: prompt.title, description: prompt.description, argsSchema: z.object(shape) }, ((args: Record<string, string | undefined>) => ({
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: prompt.text(args) } }],
    })) as never);
  }
}
