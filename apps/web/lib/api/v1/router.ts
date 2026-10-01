/**
 * The public REST API, version 1, under `/api/v1`, authenticated with personal
 * access tokens: reads are `GET`s, and the test case library, review decisions
 * and the library's references can be changed with a `write`-scoped token. Every endpoint but `/projects` is an MCP tool
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
import {
  adoptTestsTool,
  bulkUpdateTestCases,
  createTestCase,
  createTestSuite,
  deleteTestSuite,
  getTestCase,
  linkTestCase,
  listTestCases,
  listTestSuites,
  listUncoveredTests,
  updateTestCase,
} from '@/lib/mcp/tools/test-cases';
import { getReviewCheckpoint, listReviewCheckpoints, reviewCheckpoint } from '@/lib/mcp/tools/review';
import { commentOnReview, listReviewThreads, resolveReviewThread } from '@/lib/mcp/tools/review-threads';
import { getLibraryFlows, listLibrary, setLibraryReferenceTool } from '@/lib/mcp/tools/library';
import { listFeedbackRequests } from '@/lib/mcp/tools/feedback';
import { getVisualDiff, getVisualDiffImage, listVisualDiffs } from '@/lib/mcp/tools/visual-diffs';
import type { ToolDef } from '@/lib/mcp/registry';
import { authed } from '../base';
import { fromTool } from '../from-tool';

const tool = (t: unknown) => t as ToolDef;

const P = '/projects/{team}/{project}';

const runRef = z.string().describe('Run number (`128`), run id, `latest` or `latest-failed`. `latest` can be scoped with `branch` and `environment`.');
const testRef = z.string().describe('Test id, as returned by `/tests`, a run result or a failure context.');
const resultRef = z.string().describe('Result id: one test in one run, as returned by `/runs/{run}/results`.');
const attachmentRef = z.string().describe('Attachment id, as listed by a result.');
const captureRef = z.string().describe('Capture id: one variant of one review checkpoint, as returned by `/runs/{run}/review-checkpoints`.');
const caseRef = z.string().describe('Test case key (`TC-12` or `12`) or id, as returned by `/test-cases`.');
const comparisonRef = z.string().describe('Comparison id (`vc_…`): one pair of captures, as returned by `/visual-diffs`.');

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
      description: 'The tests of one run, failures first. Filter by outcome, file, error signature or category, browser, tag, retries, attachment kind and duration.',
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
    reviewCheckpoints: fromTool(tool(listReviewCheckpoints), {
      path: `${P}/runs/{run}/review-checkpoints`,
      summary: 'List a run’s review checkpoints',
      description:
        'The named review screenshots the run’s tests captured, per variant, in journey order, with each image’s review status against its approved baseline. `status` defaults to `needs-review` (changed and new).',
      tags: ['Visual review'],
      params: { run: runRef },
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
  testCases: {
    list: fromTool(tool(listTestCases), {
      path: `${P}/test-cases`,
      summary: 'List test cases',
      description:
        'The manual and automated test cases of the project. Filter by suite (id or path), status, priority, automation, tag, or what the linked Playwright tests say (`verdict`: passing, failing, flaky, stale, not_run, none).',
      tags: ['Test cases'],
    }),
    get: fromTool(tool(getTestCase), {
      path: `${P}/test-cases/{case}`,
      summary: 'Get a test case',
      description: 'One test case in full: description, conditions, steps, classification, custom fields, and its linked Playwright tests with their latest result and last 30 days.',
      tags: ['Test cases'],
      params: { case: caseRef },
    }),
    suites: fromTool(tool(listTestSuites), {
      path: `${P}/test-suites`,
      summary: 'List test suites',
      description: 'The suite tree of the test cases, with each suite’s path, id and case counts.',
      tags: ['Test cases'],
    }),
    uncovered: fromTool(tool(listUncoveredTests), {
      path: `${P}/uncovered-tests`,
      summary: 'List Playwright tests without a test case',
      description:
        'The Playwright tests no test case links to yet, one row per test with the ids of every browser it runs in, its file, describe blocks and the suite path adopting it would mirror.',
      tags: ['Test cases'],
    }),
    create: fromTool(tool(createTestCase), {
      method: 'POST',
      successStatus: 201,
      path: `${P}/test-cases`,
      summary: 'Create a test case',
      description:
        'Create a manual or automated test case with steps, in a suite (a path of names is created if missing). Answers the new key (`TC-12`); tag a Playwright test with `@TC-12` to link it on its next run. Needs the `write` scope.',
      tags: ['Test cases'],
    }),
    update: fromTool(tool(updateTestCase), {
      method: 'PATCH',
      path: `${P}/test-cases/{case}`,
      summary: 'Update a test case',
      description:
        'Change fields of a test case: title, steps, status, priority, suite, tags and the rest. Only the fields given change; every edit is a new version in its history. Pass `expectedVersion` to refuse the edit if the case changed since you read it. Needs the `write` scope.',
      tags: ['Test cases'],
      params: { case: caseRef },
    }),
    bulkUpdate: fromTool(tool(bulkUpdateTestCases), {
      method: 'POST',
      path: `${P}/test-cases/bulk`,
      summary: 'Update many test cases',
      description:
        'Apply one change to up to 200 test cases (`cases`: keys like `TC-12`, or ids): set their `priority`, `status`, `severity`, `type`, `behavior`, `automation` or `suite`, mute them, or add and remove tags. Each case that changes gets a new version in its history. Needs the `write` scope.',
      tags: ['Test cases'],
    }),
    link: fromTool(tool(linkTestCase), {
      method: 'POST',
      path: `${P}/test-cases/{case}/links`,
      summary: 'Link tests to a test case',
      description:
        'Link Playwright tests (by test id, from `/tests`) to a test case, or unlink them. A linked case is marked automated and shows the tests’ results. A lasting link comes from code instead: tag the test with `@TC-12`. Needs the `write` scope.',
      tags: ['Test cases'],
      params: { case: caseRef },
    }),
    adopt: fromTool(tool(adoptTestsTool), {
      method: 'POST',
      successStatus: 201,
      path: `${P}/test-cases/adopt`,
      summary: 'Adopt tests as test cases',
      description:
        'Turn Playwright tests (from `/uncovered-tests`) into test cases already linked to them, with steps from their `test.step()` calls, one case per test across browsers. Give `tests` (into one `suite`, or suites mirroring files and describe blocks), or `placements` to choose a suite and a title per group of tests. A test that already backs a case is skipped. Needs the `write` scope.',
      tags: ['Test cases'],
    }),
    createSuite: fromTool(tool(createTestSuite), {
      method: 'POST',
      successStatus: 201,
      path: `${P}/test-suites`,
      summary: 'Create a test suite',
      description: 'Create a suite, optionally under a `parent` suite (id or path), to group test cases the way the product is built. Suites nest at most 6 levels deep. Needs the `write` scope.',
      tags: ['Test cases'],
    }),
    deleteSuites: fromTool(tool(deleteTestSuite), {
      method: 'POST',
      path: `${P}/test-suites/delete-empty`,
      summary: 'Delete empty test suites',
      description:
        'Delete suites that hold no test cases: the named `suites` (with the suites below them), or every empty suite with `allEmpty`. Never deletes a case; a suite that still holds cases is refused. Needs the `write` scope.',
      tags: ['Test cases'],
    }),
  },
  library: {
    set: fromTool(tool(setLibraryReferenceTool), {
      method: 'POST',
      path: `${P}/library/references`,
      summary: 'Keep or pin a library reference',
      description:
        'Keep a branch or pull request in the library, pin the run that documents it (or follow the newest with `"latest"`), make it the default, name and describe it — or take it out with `keep: false`. Needs `branch` or `pullRequest`, and the `write` scope.',
      tags: ['Visual review'],
    }),
    list: fromTool(tool(listLibrary), {
      path: `${P}/library`,
      summary: 'List the library',
      description:
        'The branches and pull requests kept as visual documentation (and the default branch): which run each shows — the newest or a pinned one — and how many of the newest run’s images wait for review.',
      tags: ['Visual review'],
    }),
    flows: fromTool(tool(getLibraryFlows), {
      path: `${P}/library/flows`,
      summary: 'List a library reference’s flows',
      description:
        'The flows of a branch or pull request as the library shows them — the default reference without `branch` or `pullRequest` — each with its test cases and its checkpoints in journey order, with capture ids for `/review-captures/{capture}`.',
      tags: ['Visual review'],
    }),
  },
  reviewCaptures: {
    get: fromTool(tool(getReviewCheckpoint), {
      path: `${P}/review-captures/{capture}`,
      summary: 'Get a review checkpoint image',
      description: 'One review checkpoint image: its status, viewport, whether it matches the approved baseline, and short-lived links to it and to the baseline.',
      tags: ['Visual review'],
      params: { capture: captureRef },
      omit: ['compare', 'pins', 'pinCrops', 'maxImages'],
      // A JSON answer carries no inline images: none are read or encoded for it.
      fixedArgs: { images: 'none' },
    }),
    decide: fromTool(tool(reviewCheckpoint), {
      method: 'POST',
      path: `${P}/review-captures/decisions`,
      summary: 'Approve or reject review checkpoint images',
      description:
        'Approve review checkpoint images, or ask for changes with a comment. An approval holds for the exact pixels: later runs with the same image need no review. Only approve what you looked at. Needs the `write` scope.',
      tags: ['Visual review'],
    }),
  },
  feedbackRequests: {
    list: fromTool(tool(listFeedbackRequests), {
      path: `${P}/feedback-requests`,
      summary: 'List open visual feedback requests',
      description:
        'Every open request for a visual change — comment threads and change requests without a comment — one record each, with the producing test, the checkpoint key, the image now and the one the request was made on, and whether it waits for a fix or changed since (`verify`). The library’s default reference without `branch`, `pullRequest` or `run`. Paged with `cursor`; `counts` cover every page.',
      tags: ['Visual review'],
    }),
  },
  visualDiffs: {
    list: fromTool(tool(listVisualDiffs), {
      path: `${P}/visual-diffs`,
      summary: 'List visual differences between two runs',
      description:
        'Which review screens look different between two runs (`headRun` against `baseRun`, the newest earlier run with captures by default) or between two library references (`headBranch`/`headPullRequest` against `baseBranch`/`basePullRequest`), with the changed pixels before and after the checkpoint’s rules left areas out and a comparison id per pair. Pairs nobody measured yet are measured; pending ones say so.',
      tags: ['Visual review'],
    }),
    get: fromTool(tool(getVisualDiff), {
      path: `${P}/visual-diffs/{comparison}`,
      summary: 'Get a visual difference',
      description:
        'One comparison in detail: both captures and runs, the producing test and checkpoint, how the screen was captured, the raw and effective measurement, the active and suspended rules, and the changed regions (D1, D2…) with stable ids and rectangles in image pixels. Paged with `regionCursor`.',
      tags: ['Visual review'],
      params: { comparison: comparisonRef },
      omit: ['base', 'head'],
    }),
    render: fromTool(tool(getVisualDiffImage), {
      path: `${P}/visual-diffs/{comparison}/render`,
      summary: 'Render images of a visual difference',
      description:
        'A manifest of images for one comparison — the head boxed and numbered, base and head of a region, the painted changes, the mask, the colour difference, the overlay or a crop — each with the rectangle it shows and a short-lived signed link to the binary. The REST API never carries image bytes in JSON.',
      tags: ['Visual review'],
      params: { comparison: comparisonRef },
      fixedArgs: { delivery: 'links' },
    }),
  },
  reviewThreads: {
    list: fromTool(tool(listReviewThreads), {
      path: `${P}/review-threads`,
      summary: 'List review comment threads',
      description:
        'The comment threads pinned on a run’s review images (or one image’s, with `capture`), per image and by the number on the pin: where each points, in pixels, percent and CSS pixels, and the conversation. Open ones by default. `annotatedImageUrl` on `/review-captures/{capture}` shows the pins drawn on the image.',
      tags: ['Visual review'],
    }),
    comment: fromTool(tool(commentOnReview), {
      method: 'POST',
      path: `${P}/review-threads`,
      summary: 'Comment on a review image',
      description:
        'Pin a comment thread on a review image — at a spot or an area given in percent of the image with `at`, or about the whole image — or reply to a thread with its number in `thread`. Needs the `write` scope.',
      tags: ['Visual review'],
    }),
    status: fromTool(tool(resolveReviewThread), {
      method: 'POST',
      path: `${P}/review-threads/status`,
      summary: 'Resolve or reopen a review comment thread',
      description: 'Resolve a thread by its image (`capture`) and number, or reopen it with `status: "open"`, with an optional closing `comment`. Needs the `write` scope.',
      tags: ['Visual review'],
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
