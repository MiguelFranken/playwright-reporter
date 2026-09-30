/**
 * The test case library for assistants: read it (core toolset) and, with a
 * write-scoped token, change it (write toolset). Writes go through the same
 * service as the app, so they validate, version and audit the same way.
 */
import { z } from 'zod';
import {
  CASE_AUTOMATIONS,
  CASE_BEHAVIORS,
  CASE_PRIORITIES,
  CASE_SEVERITIES,
  CASE_STATUSES,
  CASE_TYPES,
  CASE_VERDICTS,
  caseKey,
  GHERKIN_KEYWORDS,
  MAX_BULK_CASES,
  STEP_FORMATS,
} from '@miguelfranken/ui/lib/test-cases';
import { caseNumberOf, getCaseDetail, getSuiteTree, listAutomatedTests, listCases, listSuites, suitePaths } from '@/lib/db/queries/test-cases';
import { parseCaseKey } from '@/lib/test-cases/model';
import {
  adoptTests,
  bulkUpdate,
  CaseError,
  createCase,
  createSuite,
  deleteEmptySuites,
  describePath,
  ensureSuite,
  fileLabel,
  linkTests,
  resolveCaseId,
  unlinkTest,
  updateCase,
  type CaseContext,
} from '@/lib/test-cases/service';
import { invalid, notFound } from '../errors';
import { commonParams, cursorParam, limitParam, nextCursor, readPage } from '../params';
import { defineTool, output } from '../registry';
import { link, type MarkdownBuilder } from '../render/markdown';
import type { ResolvedProject } from '../context';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
const REMOVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true } as const;

const caseParam = z.string().describe('Test case key ("TC-12" or "12") or its id.');
const suiteParam = z
  .string()
  .describe('Suite id, or its path of names from the top ("Checkout / Coupons"), as list_test_suites shows it.');

const stepSchema = z.object({
  action: z.string().describe('What to do (classic), or the sentence after the keyword (Gherkin).'),
  data: z.string().optional().describe('Test data (classic only).'),
  expected: z.string().optional().describe('Expected result (classic only).'),
  keyword: z.enum(GHERKIN_KEYWORDS).optional().describe('Gherkin only: given, when, then, and or but.'),
});

const editable = {
  description: z.string().optional().describe('What the case checks, and why.'),
  preconditions: z.string().optional(),
  postconditions: z.string().optional(),
  stepsFormat: z.enum(STEP_FORMATS).optional().describe('classic (action / test data / expected result) or gherkin.'),
  steps: z.array(stepSchema).max(100).optional().describe('Replaces every step.'),
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  severity: z.enum(CASE_SEVERITIES).optional(),
  type: z.enum(CASE_TYPES).optional(),
  behavior: z.enum(CASE_BEHAVIORS).optional(),
  automation: z
    .enum(CASE_AUTOMATIONS)
    .optional()
    .describe('manual, planned (to be automated) or automated. Linking a test sets automated by itself; prefer link_test_case.'),
  muted: z.boolean().optional(),
  tags: z.array(z.string()).optional().describe('Replaces every tag.'),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe("The project's custom fields, by key."),
};

function caseError(error: unknown): never {
  if (error instanceof CaseError) throw error.code === 'not_found' ? notFound(error.message) : invalid(error.message);
  throw error;
}

function contextOf(project: ResolvedProject): CaseContext {
  return { projectId: project.project.id, teamId: project.team.id, actorId: project.user.id };
}

async function suiteId(project: ResolvedProject, ref: string | undefined, create: boolean): Promise<string | null | undefined> {
  if (ref === undefined) return undefined;
  const value = ref.trim();
  if (!value || /^unassigned$/i.test(value)) return null;
  const suites = await listSuites(project.project.id);
  const byId = suites.find((s) => s.id === value);
  if (byId) return byId.id;
  const path = value.split(/\s*\/\s*/).filter(Boolean);
  const paths = suitePaths(suites);
  const match = suites.find((s) => (paths.get(s.id) ?? []).join('\u0000').toLowerCase() === path.join('\u0000').toLowerCase());
  if (match) return match.id;
  if (!create) throw notFound(`No suite "${value}" in ${project.ref}.`, 'Call list_test_suites for the suites and their paths.');
  return ensureSuite(contextOf(project), path).catch(caseError);
}

// ---------------------------------------------------------------- list_test_suites

const suitesInput = z.object({ ...commonParams });
const suitesOutput = output({
  project: z.string(),
  total: z.number(),
  unassigned: z.number(),
  suites: z.array(z.object({ id: z.string(), path: z.string(), depth: z.number(), cases: z.number(), casesWithSubSuites: z.number() })),
});

export const listTestSuites = defineTool({
  name: 'list_test_suites',
  title: 'List test suites',
  toolset: 'core',
  description: "The project's test case suites as a tree, with how many cases each holds. Use a suite's path or id wherever a tool takes a suite.",
  input: suitesInput,
  output: suitesOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { testCase: ['read'] });
    const tree = await getSuiteTree(project.project.id);
    const flat: { id: string; path: string; depth: number; cases: number; casesWithSubSuites: number }[] = [];
    const walk = (nodes: typeof tree.roots, trail: string[]) => {
      for (const n of nodes) {
        const path = [...trail, n.name];
        flat.push({ id: n.id, path: path.join(' / '), depth: n.depth, cases: n.caseCount, casesWithSubSuites: n.totalCount });
        walk(n.children, path);
      }
    };
    walk(tree.roots, []);
    return {
      data: { project: project.ref, total: tree.total, unassigned: tree.unassigned, suites: flat },
      render(md, d) {
        md.heading(`Test suites in ${d.project}`, 2);
        if (d.suites.length === 0) md.line('No suites yet. create_test_suite makes one; create_test_case creates the suite path it is given.');
        else md.list(d.suites.map((s) => `${'  '.repeat(s.depth)}${s.path.split(' / ').at(-1)} — ${s.casesWithSubSuites} cases (path "${s.path}")`));
        md.line(`${d.total} cases in total, ${d.unassigned} unassigned.`);
      },
    };
  },
});

// ---------------------------------------------------------------- list_test_cases

const listInput = z.object({
  ...commonParams,
  search: z.string().optional().describe('Matches the key (TC-12), title, description, conditions, steps and tags.'),
  suite: suiteParam.optional().describe('Only this suite and the suites below it; "unassigned" for cases without one.'),
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  automation: z.enum(CASE_AUTOMATIONS).optional(),
  verdict: z.enum(CASE_VERDICTS).optional().describe('What the linked Playwright tests say: passing, failing, flaky, stale, not_run, or none (no linked tests).'),
  tag: z.string().optional(),
  limit: limitParam,
  cursor: cursorParam,
});

const caseRow = z.object({
  key: z.string(),
  title: z.string(),
  suite: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  automation: z.string(),
  verdict: z.string(),
  linkedTests: z.number(),
  tags: z.array(z.string()),
  url: z.string(),
});

const listOutput = output({ project: z.string(), total: z.number(), cases: z.array(caseRow), nextCursor: z.string().nullable() });

export const listTestCases = defineTool({
  name: 'list_test_cases',
  title: 'List test cases',
  toolset: 'core',
  description:
    'Search and filter the manual and automated test cases of a project: by suite, status, priority, automation, tag, or what their linked Playwright tests say (failing, flaky, stale). Each row has its key (TC-12) for get_test_case.',
  input: listInput,
  output: listOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { testCase: ['read'] });
    const suite = args.suite?.trim().toLowerCase() === 'unassigned' ? 'unassigned' : ((await suiteId(project, args.suite, false)) ?? undefined);
    const filters = {
      suite,
      q: args.search,
      status: args.status ? [args.status] : undefined,
      priority: args.priority ? [args.priority] : undefined,
      automation: args.automation ? [args.automation] : undefined,
      verdict: args.verdict ? [args.verdict] : undefined,
      tags: args.tag ? [args.tag] : undefined,
    };
    const page = readPage('list_test_cases', filters, args);
    const result = await listCases(project.project.id, { ...filters, page: 1, pageSize: 100_000 });
    const rows = result.rows.slice(page.offset, page.offset + page.limit);
    return {
      data: {
        project: project.ref,
        total: result.total,
        cases: rows.map((r) => ({
          key: caseKey(r.number),
          title: r.title,
          suite: r.suitePath.length ? r.suitePath.join(' / ') : null,
          status: r.status,
          priority: r.priority,
          automation: r.automation === 'automated' && r.linkCount === 0 ? 'automated (unverified: no linked test)' : r.automation,
          verdict: r.verdict,
          linkedTests: r.linkCount,
          tags: r.tags,
          url: project.links.testCase(r.number),
        })),
        nextCursor: nextCursor('list_test_cases', filters, page, result.total),
      },
      render(md, d) {
        md.heading(`Test cases in ${d.project}`, 2);
        if (d.cases.length === 0) {
          md.line('No test cases match.');
          return;
        }
        const shown = md.table(
          ['Case', 'Suite', 'Status', 'Priority', 'Automation', 'Linked tests'],
          d.cases.map((c) => [`${link(c.key, c.url)} ${c.title}`, c.suite, c.status, c.priority, c.automation, c.linkedTests ? `${c.verdict} (${c.linkedTests})` : '–']),
        );
        md.notice(`Showing ${page.offset + 1}–${page.offset + shown} of ${d.total}.${d.nextCursor ? ` Next page: cursor "${d.nextCursor}".` : ''}`);
      },
    };
  },
});

// ---------------------------------------------------------------- get_test_case

const getInput = z.object({ ...commonParams, case: caseParam });
const getOutput = output({
  key: z.string(),
  title: z.string(),
  suite: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  severity: z.string(),
  type: z.string(),
  behavior: z.string(),
  automation: z.string(),
  muted: z.boolean(),
  tags: z.array(z.string()),
  description: z.string(),
  preconditions: z.string(),
  postconditions: z.string(),
  stepsFormat: z.string(),
  steps: z.array(z.object({ keyword: z.string().optional(), action: z.string(), data: z.string().optional(), expected: z.string().optional() })),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  verdict: z.string(),
  version: z.number(),
  linkedTests: z.array(
    z.object({
      testId: z.string(),
      title: z.string(),
      file: z.string(),
      browser: z.string(),
      linkedFrom: z.string(),
      lastOutcome: z.string().nullable(),
      lastRunNumber: z.number().nullable(),
      runs30d: z.number(),
      passed30d: z.number(),
      flaky30d: z.number(),
    }),
  ),
  url: z.string(),
});

export const getTestCase = defineTool({
  name: 'get_test_case',
  title: 'Get a test case',
  toolset: 'core',
  description:
    'One test case in full: description, conditions, steps, classification, custom fields, and the Playwright tests linked to it with their latest result and last 30 days. Takes a key like TC-12.',
  input: getInput,
  output: getOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { testCase: ['read'] });
    const number = parseCaseKey(args.case) ?? (await numberOfId(project, args.case));
    const detail = number ? await getCaseDetail(project.project.id, number) : null;
    if (!detail) throw notFound(`Test case ${args.case} does not exist in ${project.ref}.`, 'Call list_test_cases to find it.');
    const url = project.links.testCase(detail.number);
    return {
      data: {
        key: caseKey(detail.number),
        title: detail.title,
        suite: detail.suitePath.length ? detail.suitePath.join(' / ') : null,
        status: detail.status,
        priority: detail.priority,
        severity: detail.severity,
        type: detail.type,
        behavior: detail.behavior,
        automation: detail.automation,
        muted: detail.muted,
        tags: detail.tags,
        description: detail.description,
        preconditions: detail.preconditions,
        postconditions: detail.postconditions,
        stepsFormat: detail.stepsFormat,
        steps: detail.steps.map((s) => (detail.stepsFormat === 'gherkin' ? { keyword: s.keyword, action: s.action } : { action: s.action, data: s.data, expected: s.expected })),
        customFields: detail.customFields,
        verdict: detail.verdict,
        version: detail.version,
        linkedTests: detail.links.map((l) => ({
          testId: l.testId,
          title: l.title,
          file: l.file,
          browser: l.pwProject,
          linkedFrom: l.source,
          lastOutcome: l.lastOutcome,
          lastRunNumber: l.lastRunNumber,
          runs30d: l.runs,
          passed30d: l.passed,
          flaky30d: l.flaky,
        })),
        url,
      },
      render(md, d) {
        md.heading(`${link(d.key, d.url)} ${d.title}`, 2);
        md.kv([
          ['Suite', d.suite ?? 'Unassigned'],
          ['Status', d.status],
          ['Priority', d.priority],
          ['Severity', d.severity],
          ['Type', d.type],
          ['Automation', d.automation],
          ['Verdict of linked tests', d.verdict],
          ['Tags', d.tags.join(', ') || null],
          ['Version', d.version],
        ]);
        if (d.description) md.untrusted('Description', d.description);
        if (d.preconditions) md.untrusted('Preconditions', d.preconditions);
        if (d.steps.length) {
          md.heading('Steps', 3);
          md.list(d.steps.map((s, i) => (d.stepsFormat === 'gherkin' ? `${s.keyword} ${s.action}` : `${i + 1}. ${s.action}${s.data ? ` [data: ${s.data}]` : ''}${s.expected ? ` → ${s.expected}` : ''}`)));
        }
        if (d.postconditions) md.untrusted('Postconditions', d.postconditions);
        md.heading('Linked Playwright tests', 3);
        if (d.linkedTests.length === 0) md.line(`None. Tag a Playwright test with @${d.key}, or call link_test_case.`);
        else
          md.table(
            ['Test', 'Browser', 'From', 'Last', '30 days'],
            d.linkedTests.map((t) => [`${t.title} (${t.file})`, t.browser, t.linkedFrom, t.lastOutcome ? `${t.lastOutcome} #${t.lastRunNumber}` : 'not run', `${t.passed30d}/${t.runs30d} passed, ${t.flaky30d} flaky`]),
          );
      },
    };
  },
});

async function numberOfId(project: ResolvedProject, ref: string): Promise<number | null> {
  const n = /^[0-9a-f-]{36}$/i.test(ref.trim()) ? await caseNumberOf(project.project.id, ref.trim()) : null;
  return n;
}

// ---------------------------------------------------------------- create_test_case

const createInput = z.object({
  ...commonParams,
  title: z.string().describe('What the case verifies, e.g. "Log in with valid credentials".'),
  suite: suiteParam.optional().describe('Suite id or path ("Checkout / Coupons"); missing levels are created. Omit for unassigned.'),
  ...editable,
});
const writeOutput = output({ key: z.string(), title: z.string(), version: z.number(), url: z.string(), message: z.string() });

export const createTestCase = defineTool({
  name: 'create_test_case',
  title: 'Create a test case',
  toolset: 'write',
  description:
    'Create a manual or automated test case with steps, in a suite (its path is created if missing). Answers the new key (TC-12); tag a Playwright test with @TC-12 to link it on its next run.',
  input: createInput,
  output: writeOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { testCase: ['create'] });
    const { project: _p, format: _f, maxChars: _m, suite, title, ...fields } = args;
    const row = await createCase(contextOf(project), { ...fields, title, suiteId: (await suiteId(project, suite, true)) ?? null }).catch(caseError);
    return writeResult(project, row, `${caseKey(row.number)} created. Tag a Playwright test with @${caseKey(row.number)} to link it.`);
  },
});

function writeResult(project: ResolvedProject, row: { number: number; title: string; version: number }, message: string) {
  const data = { key: caseKey(row.number), title: row.title, version: row.version, url: project.links.testCase(row.number), message };
  return {
    data,
    render(md: MarkdownBuilder, d: typeof data) {
      md.line(`${d.message} ${link(`${d.key} ${d.title}`, d.url)} (version ${d.version}).`);
    },
  };
}

// ---------------------------------------------------------------- update_test_case

const updateInput = z.object({
  ...commonParams,
  case: caseParam,
  title: z.string().optional(),
  suite: suiteParam.optional().describe('Move to this suite (id or path; missing levels are created). "unassigned" removes it from its suite.'),
  addTags: z.array(z.string()).optional().describe('Adds tags, keeping the others.'),
  removeTags: z.array(z.string()).optional(),
  expectedVersion: z.number().int().optional().describe('Refuse the edit if the case changed since this version (from get_test_case).'),
  ...editable,
});

export const updateTestCase = defineTool({
  name: 'update_test_case',
  title: 'Update a test case',
  toolset: 'write',
  description: 'Change fields of a test case: title, steps, status, priority, suite, tags and the rest. Only the fields given change; every edit is a new version in its history.',
  input: updateInput,
  output: writeOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { testCase: ['update'] });
    const { project: _p, format: _f, maxChars: _m, case: ref, suite, addTags, removeTags, expectedVersion, ...fields } = args;
    const id = await resolveCaseId(project.project.id, ref).catch(caseError);
    const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const target = await suiteId(project, suite, true);
    if (target !== undefined) patch.suiteId = target;
    if (addTags?.length || removeTags?.length) {
      const current = await getCaseDetail(project.project.id, (await numberOfId(project, id))!);
      const remove = new Set((removeTags ?? []).map((t) => t.replace(/^@/, '').toLowerCase()));
      patch.tags = [...((patch.tags as string[] | undefined) ?? current?.tags ?? []), ...(addTags ?? [])].filter((t) => !remove.has(t.replace(/^@/, '').toLowerCase()));
    }
    if (Object.keys(patch).length === 0) throw invalid('Nothing to change: pass at least one field.');
    const row = await updateCase(contextOf(project), id, patch, { expectedVersion }).catch(caseError);
    return writeResult(project, row, `${caseKey(row.number)} saved.`);
  },
});

// ---------------------------------------------------------------- bulk_update_test_cases

const bulkInput = z.object({
  ...commonParams,
  cases: z.array(caseParam).min(1).max(MAX_BULK_CASES).describe(`The cases to change, by key ("TC-12") or id; at most ${MAX_BULK_CASES}.`),
  suite: suiteParam.optional().describe('Move them to this suite (id or path; missing levels are created). "unassigned" takes them out of their suite.'),
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  severity: z.enum(CASE_SEVERITIES).optional(),
  type: z.enum(CASE_TYPES).optional(),
  behavior: z.enum(CASE_BEHAVIORS).optional(),
  automation: z.enum(CASE_AUTOMATIONS).optional(),
  muted: z.boolean().optional(),
  addTags: z.array(z.string()).optional().describe('Adds tags to each case, keeping the others.'),
  removeTags: z.array(z.string()).optional(),
});

const bulkOutput = output({ updated: z.number().describe('Cases that changed; a case that already had every value is left alone.'), cases: z.array(z.string()), message: z.string() });

export const bulkUpdateTestCases = defineTool({
  name: 'bulk_update_test_cases',
  title: 'Update many test cases',
  toolset: 'write',
  description:
    'Apply one change to many test cases at once, as ticking cases in the list does: set the priority, status, severity, type, behavior, automation or suite of each, mute them, or add and remove tags. Each changed case gets a new version in its history.',
  input: bulkInput,
  output: bulkOutput,
  annotations: { ...WRITE, idempotentHint: true },
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { testCase: ['update'] });
    const { project: _p, format: _f, maxChars: _m, cases: refs, suite, addTags, removeTags, ...fields } = args;
    const ids: string[] = [];
    for (const ref of new Set(refs)) ids.push(await resolveCaseId(project.project.id, ref).catch(caseError));
    const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const target = await suiteId(project, suite, true);
    if (target !== undefined) patch.suiteId = target;
    const clean = (tags?: string[]) => tags?.map((t) => t.replace(/^@/, ''));
    if (addTags?.length) patch.addTags = clean(addTags);
    if (removeTags?.length) patch.removeTags = clean(removeTags);
    if (Object.keys(patch).length === 0) throw invalid('Nothing to change: pass at least one field.');
    const { updated } = await bulkUpdate(contextOf(project), ids, patch).catch(caseError);
    const keys = [...new Set(refs)].map((r) => {
      const n = parseCaseKey(r);
      return n ? caseKey(n) : r;
    });
    return {
      data: { updated, cases: keys, message: `${updated} of ${ids.length} ${ids.length === 1 ? 'case' : 'cases'} changed.` },
      render(md, d) {
        md.line(`${d.message} ${d.cases.join(', ')}`);
      },
    };
  },
});

// ---------------------------------------------------------------- create_test_suite

const suiteInput = z.object({
  ...commonParams,
  name: z.string(),
  parent: suiteParam.optional().describe('Nest it under this suite (id or path). Suites nest at most 6 levels deep.'),
  description: z.string().optional(),
});
const suiteOutput = output({ id: z.string(), path: z.string(), message: z.string() });

export const createTestSuite = defineTool({
  name: 'create_test_suite',
  title: 'Create a test suite',
  toolset: 'write',
  description: 'Create a suite, optionally under a parent suite, to group test cases the way the product is built.',
  input: suiteInput,
  output: suiteOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { testCase: ['create'] });
    const parentId = (await suiteId(project, args.parent, false)) ?? null;
    const suite = await createSuite(contextOf(project), { name: args.name, description: args.description ?? '', parentId }).catch(caseError);
    const paths = suitePaths(await listSuites(project.project.id));
    const path = (paths.get(suite.id) ?? [suite.name]).join(' / ');
    return {
      data: { id: suite.id, path, message: `Suite "${path}" created.` },
      render(md, d) {
        md.line(`${d.message} Its id is ${d.id}.`);
      },
    };
  },
});

// ---------------------------------------------------------------- delete_test_suite

const deleteSuiteInput = z.object({
  ...commonParams,
  suites: z.array(suiteParam).min(1).max(100).optional().describe('Suites to delete (id or path), with the suites below them. Refused if any of them still holds cases.'),
  allEmpty: z.boolean().optional().describe('Instead: delete every suite that holds no cases, itself or below it.'),
});
const deleteSuiteOutput = output({ deleted: z.array(z.string()), message: z.string() });

export const deleteTestSuite = defineTool({
  name: 'delete_test_suite',
  title: 'Delete empty test suites',
  toolset: 'write',
  description:
    'Delete suites that hold no test cases, e.g. the ones left empty after moving cases elsewhere: the named suites, or every empty suite with allEmpty. Never deletes a case; a suite that still holds cases is refused.',
  input: deleteSuiteInput,
  output: deleteSuiteOutput,
  annotations: REMOVE,
  async handler(args, ctx) {
    if (!args.suites?.length === !args.allEmpty) throw invalid('Pass either "suites" or "allEmpty: true".');
    const project = await ctx.project(args.project, { testCase: ['delete'] });
    const before = suitePaths(await listSuites(project.project.id));
    let ids: string[] | undefined;
    if (args.suites) {
      ids = [];
      for (const ref of args.suites) {
        const id = await suiteId(project, ref, false);
        if (!id) throw invalid('"unassigned" is not a suite.');
        ids.push(id);
      }
    }
    const deleted = await deleteEmptySuites(contextOf(project), ids).catch(caseError);
    const paths = deleted.map((s) => (before.get(s.id) ?? [s.name]).join(' / '));
    return {
      data: {
        deleted: paths,
        message: deleted.length === 0 ? 'No empty suites to delete.' : `Deleted ${deleted.length} empty ${deleted.length === 1 ? 'suite' : 'suites'}.`,
      },
      render(md, d) {
        md.line(d.message);
        if (d.deleted.length) md.list(d.deleted);
      },
    };
  },
});

// ---------------------------------------------------------------- link_test_case

const linkInput = z.object({
  ...commonParams,
  case: caseParam,
  link: z.array(z.string()).max(50).optional().describe('Test ids to link, from find_tests or list_test_cases.'),
  unlink: z.array(z.string()).max(50).optional().describe('Test ids to unlink.'),
});
const linkOutput = output({ key: z.string(), linked: z.number(), unlinked: z.number(), message: z.string(), url: z.string() });

export const linkTestCase = defineTool({
  name: 'link_test_case',
  title: 'Link tests to a test case',
  toolset: 'write',
  description:
    'Link Playwright tests (by test id from find_tests) to a test case, or unlink them. A linked case is marked automated and shows the tests\' results. A lasting link comes from code instead: tag the test with @TC-12.',
  input: linkInput,
  output: linkOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { testCase: ['update'] });
    const id = await resolveCaseId(project.project.id, args.case).catch(caseError);
    if (!args.link?.length && !args.unlink?.length) throw invalid('Pass test ids in "link" or "unlink".');
    const c = contextOf(project);
    const { linked } = args.link?.length ? await linkTests(c, id, args.link).catch(caseError) : { linked: 0 };
    let unlinked = 0;
    let fromCode = 0;
    for (const testId of args.unlink ?? []) {
      const { source } = await unlinkTest(c, id, testId).catch(caseError);
      if (source) unlinked++;
      if (source === 'code') fromCode++;
    }
    const number = (await numberOfId(project, id))!;
    const key = caseKey(number);
    const message = `${linked} linked, ${unlinked} unlinked.${fromCode ? ` ${fromCode} of them came from @${key} in the test's code and come back with its next run unless the tag is removed.` : ''}`;
    return {
      data: { key, linked, unlinked, message, url: project.links.testCase(number) },
      render(md, d) {
        md.line(`${link(d.key, d.url)}: ${d.message}`);
      },
    };
  },
});

// ---------------------------------------------------------------- list_uncovered_tests

const uncoveredInput = z.object({
  ...commonParams,
  search: z.string().optional().describe('Title, file or describe block.'),
  limit: limitParam,
  cursor: cursorParam,
});
const uncoveredOutput = output({
  project: z.string(),
  total: z.number(),
  tests: z.array(
    z.object({
      testIds: z.array(z.string()),
      title: z.string(),
      file: z.string(),
      describe: z.array(z.string()),
      browsers: z.array(z.string()),
      lastOutcome: z.string().nullable(),
      mirrorSuite: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const listUncoveredTests = defineTool({
  name: 'list_uncovered_tests',
  title: 'List Playwright tests without a test case',
  toolset: 'core',
  description:
    'The Playwright tests no test case links to yet, one row per test with the ids of every browser it runs in, its file and describe blocks. The starting point for organizing tests into cases: link a row to an existing case with link_test_case, or turn it into a new case with adopt_tests.',
  input: uncoveredInput,
  output: uncoveredOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { testCase: ['read'] });
    const filters = { q: args.search };
    const page = readPage('list_uncovered_tests', filters, args);
    const { rows } = await listAutomatedTests(project.project.id, { q: args.search, uncovered: true, limit: 100_000 });
    // The same test in several Playwright projects (browsers) is one row, as adopt_tests makes it one case.
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.file}\u0000${describePath(r.titlePath, r.file, r.pwProject).join('\u0000')}\u0000${r.title}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const all = [...groups.values()].sort((a, b) => a[0].file.localeCompare(b[0].file) || a[0].title.localeCompare(b[0].title));
    return {
      data: {
        project: project.ref,
        total: all.length,
        tests: all.slice(page.offset, page.offset + page.limit).map((group) => {
          const first = group[0];
          const describe = describePath(first.titlePath, first.file, first.pwProject);
          return {
            testIds: group.map((g) => g.testId),
            title: first.title,
            file: first.file,
            describe,
            browsers: group.map((g) => g.pwProject),
            lastOutcome: first.lastOutcome,
            mirrorSuite: [fileLabel(first.file), ...describe].join(' / '),
          };
        }),
        nextCursor: nextCursor('list_uncovered_tests', filters, page, all.length),
      },
      render(md, d) {
        md.heading(`Playwright tests without a test case in ${d.project}`, 2);
        if (d.tests.length === 0) {
          md.line('Every Playwright test backs a test case.');
          return;
        }
        const shown = md.table(
          ['Test', 'File', 'Describe', 'Browsers', 'Last', 'Test ids'],
          d.tests.map((t) => [t.title, t.file, t.describe.join(' › ') || null, t.browsers.join(', '), t.lastOutcome, t.testIds.join(', ')]),
        );
        md.notice(`Showing ${page.offset + 1}–${page.offset + shown} of ${d.total}.${d.nextCursor ? ` Next page: cursor "${d.nextCursor}".` : ''}`);
      },
    };
  },
});

// ---------------------------------------------------------------- adopt_tests

const placementSchema = z.object({
  tests: z.array(z.string()).min(1).max(200).describe('Test ids, e.g. the testIds of one row of list_uncovered_tests.'),
  suite: suiteParam.optional().describe('Suite for these cases (id or path; missing levels are created). Omit to mirror file and describe blocks.'),
  title: z.string().optional().describe("Title for the case, instead of the test's own. Set it only when the tests are one test (in its browsers)."),
});

const adoptInput = z.object({
  ...commonParams,
  tests: z.array(z.string()).min(1).max(200).optional().describe('Test ids (from list_uncovered_tests or find_tests) to turn into test cases.'),
  suite: suiteParam
    .optional()
    .describe('With "tests": put every new case in this suite (id or path; created if missing). Omit to mirror each test\'s file and describe blocks as suites.'),
  placements: z
    .array(placementSchema)
    .min(1)
    .max(200)
    .optional()
    .describe('Instead of "tests": each group of tests with its own suite and title, to sort many tests into existing or new suites in one call.'),
});
const adoptOutput = output({
  created: z.array(z.object({ key: z.string(), suite: z.string().nullable(), url: z.string() })),
  skipped: z.number(),
  message: z.string(),
});

export const adoptTestsTool = defineTool({
  name: 'adopt_tests',
  title: 'Adopt Playwright tests as test cases',
  toolset: 'write',
  description:
    'Turn Playwright tests into test cases already linked to them: steps from their test.step() calls, one case per test across browsers. Give "tests" (one suite, or suites mirroring files and describe blocks), or "placements" to choose a suite and a title per test. A test that already backs a case is skipped.',
  input: adoptInput,
  output: adoptOutput,
  annotations: WRITE,
  async handler(args, ctx) {
    if (!args.tests?.length === !args.placements?.length) throw invalid('Pass either "tests" or "placements".');
    if (args.placements && args.suite !== undefined) throw invalid('"suite" goes with "tests"; with "placements", give each placement its suite.');
    const placements = args.placements ?? [{ tests: args.tests!, suite: args.suite, title: undefined }];
    if (placements.reduce((n, p) => n + p.tests.length, 0) > 200) throw invalid('Adopt at most 200 tests per call.');
    const project = await ctx.project(args.project, { testCase: ['create'] });
    const c = contextOf(project);
    const targets: (string | null | undefined)[] = [];
    for (const p of placements) targets.push(await suiteId(project, p.suite, true));
    const paths = suitePaths(await listSuites(project.project.id));
    const created: { key: string; suite: string | null; url: string }[] = [];
    let skipped = 0;
    for (const [i, p] of placements.entries()) {
      const target = targets[i];
      const title = p.title?.trim();
      const result = await adoptTests(c, {
        testIds: p.tests,
        mode: target === undefined ? 'mirror' : 'target',
        suiteId: target ?? null,
        titles: title ? Object.fromEntries(p.tests.map((id) => [id, title])) : {},
      }).catch(caseError);
      const suite = target === undefined ? 'mirrored from file' : target ? (paths.get(target) ?? []).join(' / ') : null;
      created.push(...result.created.map((row) => ({ key: caseKey(row.number), suite, url: project.links.testCase(row.number) })));
      skipped += result.skipped;
    }
    return {
      data: { created, skipped, message: `${created.length} test cases created, ${skipped} tests skipped (already backing a case, or not in the project).` },
      render(md, d) {
        md.line(d.message);
        if (d.created.length) md.list(d.created.map((row) => `${link(row.key, row.url)}${row.suite ? ` in ${row.suite}` : ' (unassigned)'}`));
      },
    };
  },
});

export const TEST_CASE_TOOLS = [
  listTestSuites,
  listTestCases,
  getTestCase,
  listUncoveredTests,
  createTestCase,
  updateTestCase,
  bulkUpdateTestCases,
  createTestSuite,
  deleteTestSuite,
  linkTestCase,
  adoptTestsTool,
];
