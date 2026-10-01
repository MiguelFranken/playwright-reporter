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
  {
    name: 'fix_visual_feedback',
    title: 'Fix visual feedback',
    description: 'Work through every open request on a branch’s screenshots: trace each to its code, fix it, re-run only the producing tests, and check the new images against the originals.',
    args: z.object({
      project,
      branch: z.string().optional().describe('The branch the work is on (the library reference). Give it: a default may be another branch.'),
      pullRequest: z.string().optional().describe('A pull request number instead of a branch.'),
      reply: z.string().optional().describe('"yes" to reply on each thread with what changed. Default: propose replies in the report, post nothing.'),
    }),
    text: (a) => {
      const ref = a.pullRequest ? `pullRequest ${a.pullRequest}` : a.branch ? `branch "${a.branch}"` : 'the branch of this checkout (ask me if unsure — do not rely on a default)';
      return `Fix the open visual feedback${scope(a)} on ${ref} with the playwright-reporter tools, in this workspace.
1. Work list. Call list_feedback_requests with ${ref}${a.project ? ` and project "${a.project}"` : ''}, following nextCursor to the end. It covers screens a partial run skipped and change requests without a comment. Write down every request (requestId, test, checkpoint key, variant, current and original capture, the conversation) before changing anything, and keep each one in the list until the end, even if it stops appearing.
2. Evidence. For each request, get_review_checkpoint with its capture, thread and against "origin" (images "focus" for a tall page), and read the whole conversation. A request without a comment: look at the image to see what should change; ask me only if it stays ambiguous, and keep fixing the others meanwhile. Pixel coordinates are the image’s, not CSS pixels; a pin carried over from an earlier image may be off.
3. Code. Search the spec for the checkpoint key, follow its setup into the route, component or template and shared primitives, and fix the owner. Keep test titles and checkpoint keys. Change a test only when it misrepresents correct behaviour.
4. Re-run only the producing tests (list_feedback_requests "producers"), with this repository’s own launcher. Preview the selection with --list and check the titles and count against the producers before running; get_rerun_command gives anchored selectors and a preview.
5. Verify. With the uploaded run: get_run for its counts and artifacts, list_review_checkpoints with status "all", then for each request get_review_checkpoint of the new capture against the original (againstCapture) in every variant. Keep four results apart: test passed, image stored, change made as asked, approved by a person. A passed test, a changed image or an "outdated" thread is not an approval — and verify_fix judges test behaviour, not visual requests.
6. Hand-off. Report every initial request: its cause and fix, producing test, links to the original and the new image in the app, and your verdict. Do not resolve threads, approve images or change library settings.${a.reply === 'yes' ? ' Reply on each thread with comment_on_review, agent set to your name, saying what changed and where (file and component) and which run shows it.' : ' Do not post replies: include the reply you would post for each thread in the report.'}`;
    },
  },
  {
    name: 'investigate_visual_diffs',
    title: 'Investigate visual differences between two runs',
    description: 'Find out why screens look different between two runs that may both be green, region by region, down to the test and code that produce them — without changing anything.',
    args: z.object({
      project,
      head: z.string().optional().describe('The run looked at, e.g. "#81" (default: the latest run with review captures).'),
      base: z.string().optional().describe('The run compared against (default: the newest earlier run with captures on the same branch).'),
      fix: z.string().optional().describe('"yes" to also fix unintended randomness or time dependence in this repository. Default: investigate and report only.'),
    }),
    text: (a) => {
      const pair = `${a.head ? `headRun "${a.head}"` : 'the latest run'}${a.base ? ` against baseRun "${a.base}"` : ''}`;
      return `Investigate the visual differences${scope(a)} between ${pair} with the playwright-reporter tools, in this workspace.
1. Call list_visual_diffs with ${pair}${a.project ? ` and project "${a.project}"` : ''}. Every row is one screen (test, checkpoint, variant) with the exact base and head captures and a comparisonId. Both runs may be green: a changed screen is evidence, not a defect.
2. For each changed screen, call get_visual_diff with its comparisonId: the producing test (file, title path, checkpoint key, step), raw changed pixels, what the checkpoint's rules left out, and the regions D1, D2… Then get_visual_diff_image with mode "annotated" and scope "overview" to see where the regions are, and mode "pair" with regionIds to read each region then and now at full resolution. Use "highlight", "mask", "difference" or "onion" only when a pair does not explain a change.
3. For each region write down the observation (what differs, where), the hypothesis (a random fixture name, a date or clock, another user, a sort order, a rendering difference, a real change) and what would prove it. Search this repository for the checkpoint key, follow the test into its fixtures and data setup and into the UI code that renders the region, and name the cause only when the code shows it.
4. Report per screen and region: observation, cause (proven or hypothesis, with the evidence missing), the files involved, and your recommendation — stabilise a fixture or clock in the repository, treat as a real regression, accept, or consider leaving a tightly bounded area out (say which rectangle and why). Give the reviewUrl of each screen.
${a.fix === 'yes' ? '5. Fix the unintended randomness or time dependence you proved, at the source (a seeded fixture, a frozen clock, a stable sort), without changing test titles or checkpoint keys. Re-run only the producing tests, then compare the new captures with the base captures (get_visual_diff with base and head capture ids). Two independent new runs show stability; one does not. Do not add rules that leave areas out, approve images or resolve threads: those are a person’s call.' : 'Change no code, no rules and no review decisions: this is an investigation. Say what you would change and where.'}`;
    },
  },
  {
    name: 'organize_tests',
    title: 'Organize tests into test cases',
    description: 'Sort the Playwright tests no test case covers yet into existing or new cases and suites.',
    args: z.object({ project, search: z.string().optional().describe('Only tests whose title, file or describe block matches.') }),
    text: (a) =>
      `Organize the Playwright tests that no test case covers yet${scope(a)} with the playwright-reporter tools. Call list_uncovered_tests${a.search ? ` with search "${a.search}"` : ''} (follow nextCursor to the end), list_test_suites and list_test_cases. For each test, decide:
1. It automates an existing case (usually a manual or planned one with the same intent): link its testIds with link_test_case.
2. Otherwise it becomes a new case: choose an existing suite by what the product feature is, or a new suite path when none fits, and a clear title that says what the case verifies.
Show me the plan as a table (test → existing case, or new case title and suite) and wait for my go. Then apply it: one adopt_tests call with "placements" (one placement per row, all of its testIds, its suite and title), and link_test_case for the matches. Finish with delete_test_suite allEmpty if suites were left empty, and give me the links to the created cases.`,
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
