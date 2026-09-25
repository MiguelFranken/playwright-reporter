/**
 * The public REST API, version 1: read-only, under `/api/v1`, authenticated
 * with personal access tokens. Every endpoint but `/projects` is an MCP tool
 * exposed through `fromTool`, so the two interfaces answer from the same code.
 *
 * Changes inside v1 are additive only. `docs/openapi.json` is generated from
 * this router (`nub run api:docs` in apps/web) and CI compares it with `main`.
 */
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { projectLinks } from '@/lib/mcp/render/links';
import { checkFlakiness } from '@/lib/mcp/tools/check-flakiness';
import { compareRuns } from '@/lib/mcp/tools/compare-runs';
import { findTests } from '@/lib/mcp/tools/find-tests';
import { getArtifact } from '@/lib/mcp/tools/get-artifact';
import { getFailureContext } from '@/lib/mcp/tools/get-failure-context';
import { getRerunCommand } from '@/lib/mcp/tools/get-rerun-command';
import { getResult } from '@/lib/mcp/tools/get-result';
import { getRun } from '@/lib/mcp/tools/get-run';
import { getTestHistory } from '@/lib/mcp/tools/get-test-history';
import { listFilters } from '@/lib/mcp/tools/list-filters';
import { listRunResults } from '@/lib/mcp/tools/list-run-results';
import { listRuns } from '@/lib/mcp/tools/list-runs';
import { projectHealth } from '@/lib/mcp/tools/project-health';
import { summarizeFailures } from '@/lib/mcp/tools/summarize-failures';
import { verifyFixTool } from '@/lib/mcp/tools/verify-fix';
import { whoami } from '@/lib/mcp/tools/whoami';
import type { ToolDef } from '@/lib/mcp/registry';
import { authed } from '../base';
import { fromTool } from '../from-tool';

const tool = (t: unknown) => t as ToolDef;

const P = '/projects/{team}/{project}';

const runRef = z.string().describe('Run number (`128`), run id, `latest` or `latest-failed`. `latest` can be scoped with `branch` and `environment`.');
const testRef = z.string().describe('Test id, as returned by `/tests`, a run result or a failure context.');
const resultRef = z.string().describe('Result id: one test in one run, as returned by `/runs/{run}/results`.');
const attachmentRef = z.string().describe('Attachment id, as listed by a result.');

const projectSchema = z.object({
  ref: z.string().describe('"team/project", the form other endpoints and the MCP server accept.'),
  team: z.object({ slug: z.string(), name: z.string() }),
  slug: z.string(),
  name: z.string(),
  role: z.string().describe('Your role in the team: admin, member, viewer, or superadmin.'),
  lastRunAt: z.string().nullable().describe('Start of the newest run, ISO 8601.'),
  url: z.string().describe('The project in the app.'),
});

const listProjects = authed
  .meta(
    openapi({
      method: 'GET',
      path: '/projects',
      operationId: 'listProjects',
      summary: 'List projects',
      description: 'Every project the token can read, most recently active first. A token restricted to teams or one project sees only those.',
      tags: ['Account'],
    }),
  )
  .output(z.object({ projects: z.array(projectSchema) }))
  .handler(async ({ context }) => {
    const { listAccessibleProjects } = await import('@/lib/auth/principal');
    const projects = await listAccessibleProjects(context.caller.principal);
    return {
      projects: projects.map((p) => ({
        ref: `${p.team.slug}/${p.project.slug}`,
        team: { slug: p.team.slug, name: p.team.name },
        slug: p.project.slug,
        name: p.project.name,
        role: p.role,
        lastRunAt: p.lastRunAt?.toISOString() ?? null,
        url: projectLinks(p.team.slug, p.project.slug).base,
      })),
    };
  });

export const router = {
  me: fromTool(tool(whoami), {
    path: '/me',
    summary: 'Verify the token',
    description: 'Who the token acts as, its scopes, expiry and restrictions, and the teams and projects it can read. Call it first to check a token.',
    tags: ['Account'],
    projectScoped: false,
    omitOutput: ['defaultProject', 'toolsets'],
  }),
  projects: {
    list: listProjects,
    filters: fromTool(tool(listFilters), {
      path: `${P}/filters`,
      summary: 'List filter values',
      description: 'The branches, environments, browser projects, test tags, run tags and commit authors seen in the project recently, and its base branch. Use them as filter values elsewhere.',
      tags: ['Projects'],
    }),
    health: fromTool(tool(projectHealth), {
      path: `${P}/health`,
      summary: 'Project health',
      description:
        'Where the project stands and what to fix first: run pass rate, reliability, a ranked fix-first list (failures weigh fully, flakes half), the flakiest and slowest tests, tests getting slower and the most widespread errors.',
      tags: ['Projects'],
    }),
  },
  runs: {
    list: fromTool(tool(listRuns), {
      path: `${P}/runs`,
      summary: 'List runs',
      description: 'Test runs, newest first. Filter by status, branch, pull request, environment, author, commit, tag, CI or local, and a time window. Each run carries its counts and a link.',
      tags: ['Runs'],
    }),
    get: fromTool(tool(getRun), {
      path: `${P}/runs/{run}`,
      summary: 'Get a run',
      description: 'One run: status, git and CI context, counts, the top failure groups by error signature and, with `include`, its slowest specs, shards and system metadata.',
      tags: ['Runs'],
      params: { run: runRef },
    }),
    results: fromTool(tool(listRunResults), {
      path: `${P}/runs/{run}/results`,
      summary: 'List the results of a run',
      description: 'The tests of one run, failures first. Filter by outcome, file, error signature or category, browser, retries, artifacts and duration.',
      tags: ['Runs'],
      params: { run: runRef },
    }),
    failureGroups: fromTool(tool(summarizeFailures), {
      path: `${P}/runs/{run}/failure-groups`,
      summary: 'Group a run’s failures',
      description:
        'A run’s failures grouped by root cause (error signature), largest group first, each with its category, the affected files and browsers, and whether it is new or already failing on the base branch.',
      tags: ['Diagnostics'],
      params: { run: runRef },
    }),
    compare: fromTool(tool(compareRuns), {
      path: `${P}/runs/{run}/compare`,
      summary: 'Compare two runs',
      description:
        'What changed between `base` and this run: new failures, fixed tests, new flakes, tests still failing (with the same or a different error), added and removed tests, and tests that got much slower. Without `base`, the latest finished run on the base branch before this one.',
      tags: ['Diagnostics'],
      params: { run: runRef },
      rename: { run: 'head' },
      omit: ['branch'],
    }),
    rerunCommand: fromTool(tool(getRerunCommand), {
      path: `${P}/runs/{run}/rerun-command`,
      summary: 'Re-run command',
      description: 'The exact `npx playwright test …` command that re-runs the run’s failed or flaky tests on the same browser projects, one command per project.',
      tags: ['Diagnostics'],
      params: { run: runRef },
    }),
  },
  results: {
    get: fromTool(tool(getResult), {
      path: `${P}/results/{result}`,
      summary: 'Get a result',
      description: 'One test execution in full: every attempt with its errors (message, location, code snippet, stack), the failing step, attachments with short-lived links, and recent history.',
      tags: ['Results'],
      params: { result: resultRef },
      omit: ['run', 'test', 'file', 'browser', 'branch', 'environment'],
    }),
    failureContext: fromTool(tool(getFailureContext), {
      path: `${P}/results/{result}/failure-context`,
      summary: 'Failure context',
      description:
        'Everything needed to debug a failing or flaky result: the failure, a verdict over its attempts, the regression window, how far the error spreads, what can be ruled out, and what it points to.',
      tags: ['Diagnostics'],
      params: { result: resultRef },
      omit: ['test', 'run', 'file', 'browser'],
    }),
  },
  tests: {
    list: fromTool(tool(findTests), {
      path: `${P}/tests`,
      summary: 'Find tests',
      description: 'Rank or search tests across runs: flakiest, most failing, chronic, slowest (p95), getting slower, least reliable, or by title.',
      tags: ['Tests'],
    }),
    get: fromTool(tool(getTestHistory), {
      path: `${P}/tests/{test}`,
      summary: 'Get a test’s history',
      description:
        'One test over time: reliability, failure and flaky rate, p95 duration and trend, streak, breakdown by environment and branch, the same test in other browser projects, its distinct errors and recent executions.',
      tags: ['Tests'],
      params: { test: testRef },
      omit: ['file', 'browser'],
    }),
    flakiness: fromTool(tool(checkFlakiness), {
      path: `${P}/tests/{test}/flakiness`,
      summary: 'Check flakiness',
      description: 'Is the test flaky, broken, or is there too little data to say? Judged across runs: retries that passed, the same commit both passing and failing, and how often it flips.',
      tags: ['Diagnostics'],
      params: { test: testRef },
      omit: ['file', 'browser'],
    }),
    verifyFix: fromTool(tool(verifyFixTool), {
      path: `${P}/tests/{test}/verify-fix`,
      summary: 'Verify a fix',
      description: 'Did later runs fix the test? Give the run it failed in as `baselineRun`.',
      tags: ['Diagnostics'],
      params: { test: testRef },
      omit: ['file', 'browser'],
    }),
  },
  attachments: {
    get: fromTool(tool(getArtifact), {
      path: `${P}/attachments/{attachment}`,
      summary: 'Get an attachment',
      description: 'One attachment’s metadata and a short-lived download link; text attachments inline, traces with a trace-viewer link.',
      tags: ['Results'],
      params: { attachment: attachmentRef },
      omit: ['result', 'name', 'kind'],
    }),
  },
};

export type ApiRouter = typeof router;
