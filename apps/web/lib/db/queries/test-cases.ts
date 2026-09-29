import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  testCaseFields,
  testCaseLinks,
  testCases,
  testCaseVersions,
  runs,
  testResults,
  tests,
  testSuites,
  users,
  type TestCase,
  type TestSuite,
} from '@/lib/db/schema';
import { caseVerdict, HEALTH_WINDOW_DAYS, type CaseSnapshot } from '@/lib/test-cases/model';
import {
  caseKey,
  CASE_AUTOMATIONS,
  CASE_SORTS,
  type CaseSort,
  CASE_STATUSES,
  type CaseAutomation,
  type CaseFieldDef,
  type CasePriority,
  type CaseSeverity,
  type CaseStatus,
  type CaseType,
  type CaseVerdict,
} from '@miguelfranken/ui/lib/test-cases';
import type {
  AutomatedTestOption,
  CaseDetail,
  CaseRow,
  CaseSnapshotView,
  CaseVersionRow,
  CoverageSummary,
  LinkedTest,
  SuiteNode,
} from '@miguelfranken/ui/lib/test-case-models';
import { num, sinceDate } from './shared';

export type { AutomatedTestOption, CaseDetail, CaseRow, CaseVersionRow, CoverageSummary, LinkedTest, SuiteNode };

// ---------------------------------------------------------------- suites

export async function listSuites(projectId: string): Promise<TestSuite[]> {
  return db.select().from(testSuites).where(eq(testSuites.projectId, projectId)).orderBy(asc(testSuites.position), asc(testSuites.name));
}

/**
 * The suite tree with case counts. Counts include deprecated cases only when
 * asked, so the tree agrees with the list next to it.
 */
export async function getSuiteTree(projectId: string): Promise<{ roots: SuiteNode[]; unassigned: number; total: number }> {
  const [suites, counts] = await Promise.all([
    listSuites(projectId),
    db
      .select({ suiteId: testCases.suiteId, n: sql<number>`count(*)::int` })
      .from(testCases)
      .where(eq(testCases.projectId, projectId))
      .groupBy(testCases.suiteId),
  ]);
  const own = new Map(counts.map((c) => [c.suiteId, c.n]));
  const roots = buildTree(suites, (id) => own.get(id) ?? 0);
  return { roots, unassigned: own.get(null) ?? 0, total: counts.reduce((a, c) => a + c.n, 0) };
}

export function buildTree(suites: readonly Pick<TestSuite, 'id' | 'name' | 'description' | 'parentId'>[], countOf: (id: string) => number): SuiteNode[] {
  const nodes = new Map<string, SuiteNode>();
  for (const s of suites) {
    nodes.set(s.id, { id: s.id, name: s.name, description: s.description, parentId: s.parentId, depth: 0, caseCount: countOf(s.id), totalCount: 0, children: [] });
  }
  const roots: SuiteNode[] = [];
  for (const s of suites) {
    const node = nodes.get(s.id)!;
    const parent = s.parentId ? nodes.get(s.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const walk = (node: SuiteNode, depth: number): number => {
    node.depth = depth;
    node.totalCount = node.caseCount + node.children.reduce((a, c) => a + walk(c, depth + 1), 0);
    return node.totalCount;
  };
  for (const r of roots) walk(r, 0);
  return roots;
}

/** Suite id → the names from the root down to it. */
export function suitePaths(suites: readonly Pick<TestSuite, 'id' | 'name' | 'parentId'>[]): Map<string, string[]> {
  const byId = new Map(suites.map((s) => [s.id, s]));
  const memo = new Map<string, string[]>();
  const pathOf = (id: string, seen = new Set<string>()): string[] => {
    const hit = memo.get(id);
    if (hit) return hit;
    const s = byId.get(id);
    if (!s || seen.has(id)) return [];
    seen.add(id);
    const path = [...(s.parentId ? pathOf(s.parentId, seen) : []), s.name];
    memo.set(id, path);
    return path;
  };
  for (const s of suites) pathOf(s.id);
  return memo;
}

/** The ids of a suite and every suite below it. */
export function subtreeIds(suites: readonly Pick<TestSuite, 'id' | 'parentId'>[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const s of suites) if (s.parentId) children.set(s.parentId, [...(children.get(s.parentId) ?? []), s.id]);
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.includes(id)) continue;
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

// ---------------------------------------------------------------- health

interface LinkHealth {
  caseId: string;
  testId: string;
  source: 'manual' | 'code';
  lastOutcome: string | null;
  lastRunAt: Date | null;
  lastRunNumber: number | null;
  runs: number;
  passed: number;
  failed: number;
  flaky: number;
}

/**
 * Every link of the given cases with its test's latest result and its counts
 * over the health window. One index range scan per linked test.
 */
async function linkHealth(caseIds: readonly string[]): Promise<LinkHealth[]> {
  if (caseIds.length === 0) return [];
  const since = sinceDate(HEALTH_WINDOW_DAYS);
  const rows = await db.execute<Record<string, unknown>>(sql`
    select l.case_id, l.test_id, l.source,
           last.outcome as last_outcome, last.started_at as last_run_at, last.number as last_run_number,
           coalesce(win.runs, 0) as runs, coalesce(win.passed, 0) as passed,
           coalesce(win.failed, 0) as failed, coalesce(win.flaky, 0) as flaky
    from ${testCaseLinks} l
    left join lateral (
      select tr.outcome, tr.started_at, r.number
      from ${testResults} tr join ${runs} r on r.id = tr.run_id
      where tr.test_id = l.test_id and tr.outcome <> 'running'
      order by tr.started_at desc limit 1
    ) last on true
    left join lateral (
      select count(*)::int as runs,
             count(*) filter (where tr.outcome = 'passed')::int as passed,
             count(*) filter (where tr.outcome in ('failed','timedout','interrupted'))::int as failed,
             count(*) filter (where tr.outcome = 'flaky')::int as flaky
      from ${testResults} tr
      where tr.test_id = l.test_id and tr.started_at >= ${since} and tr.outcome <> 'running'
    ) win on true
    where l.case_id in (${sql.join(caseIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
  return Array.from(rows).map((r) => ({
    caseId: String(r.case_id),
    testId: String(r.test_id),
    source: r.source as 'manual' | 'code',
    lastOutcome: (r.last_outcome as string | null) ?? null,
    lastRunAt: r.last_run_at ? new Date(r.last_run_at as string) : null,
    lastRunNumber: r.last_run_number == null ? null : num(r.last_run_number),
    runs: num(r.runs),
    passed: num(r.passed),
    failed: num(r.failed),
    flaky: num(r.flaky),
  }));
}

function groupBy<T, K>(items: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}

// ---------------------------------------------------------------- list

export { CASE_SORTS, type CaseSort };

export interface CaseFilters {
  /** A suite id (its whole subtree), `'unassigned'`, or undefined for every case. */
  suite?: string;
  q?: string;
  status?: CaseStatus[];
  priority?: CasePriority[];
  severity?: CaseSeverity[];
  type?: CaseType[];
  automation?: CaseAutomation[];
  verdict?: CaseVerdict[];
  tags?: string[];
  muted?: boolean;
  /** Marked automated without a linked test. */
  unverified?: boolean;
  sort?: CaseSort;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const PRIORITY_RANK: Record<CasePriority, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

function list<T>(values: readonly T[] | undefined): T[] | undefined {
  return values && values.length ? [...values] : undefined;
}

/** A search matches the key (`TC-12`), the title, the texts, the tags and the steps. */
function searchSql(q: string): SQL {
  const key = /^\s*(?:tc-|#)(\d{1,9})\s*$/i.exec(q);
  if (key) return sql`${testCases.number} = ${Number(key[1])}`;
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return sql`(${testCases.title} ilike ${like} or ${testCases.description} ilike ${like}
    or ${testCases.preconditions} ilike ${like} or ${testCases.postconditions} ilike ${like}
    or ${testCases.steps}::text ilike ${like} or array_to_string(${testCases.tags}, ' ') ilike ${like}
    or ('tc-' || ${testCases.number}::text) = lower(${q.trim()}))`;
}

/**
 * Cases matching the filters, with the verdict of their linked tests. The
 * verdict is computed per case, so filtering and sorting happen after it —
 * which is fine at the size a project's case library has (thousands, not
 * millions).
 */
export async function listCases(projectId: string, f: CaseFilters = {}, now = new Date()) {
  const suites = await listSuites(projectId);
  const where: SQL[] = [eq(testCases.projectId, projectId)];
  if (f.suite === 'unassigned') where.push(sql`${testCases.suiteId} is null`);
  else if (f.suite) where.push(inArray(testCases.suiteId, subtreeIds(suites, f.suite)));
  if (f.q?.trim()) where.push(searchSql(f.q.trim()));
  if (list(f.status)) where.push(inArray(testCases.status, f.status!));
  if (list(f.priority)) where.push(inArray(testCases.priority, f.priority!));
  if (list(f.severity)) where.push(inArray(testCases.severity, f.severity!));
  if (list(f.type)) where.push(inArray(testCases.type, f.type!));
  if (list(f.automation)) where.push(inArray(testCases.automation, f.automation!));
  if (list(f.tags)) where.push(sql`${testCases.tags} && array[${sql.join(f.tags!.map((t) => sql`${t}`), sql`, `)}]::text[]`);
  if (f.muted !== undefined) where.push(eq(testCases.muted, f.muted));

  const rows = await db
    .select()
    .from(testCases)
    .where(and(...where))
    .orderBy(asc(testCases.position), asc(testCases.number));
  const health = groupBy(await linkHealth(rows.map((r) => r.id)), (h) => h.caseId);
  const paths = suitePaths(suites);
  const suiteOrder = suiteOrderIndex(suites);

  let out = rows.map((r) => toRow(r, health.get(r.id) ?? [], paths, now));
  if (list(f.verdict)) out = out.filter((r) => f.verdict!.includes(r.verdict));
  if (f.unverified) out = out.filter((r) => r.automation === 'automated' && r.linkCount === 0);

  const dir = f.dir === 'desc' ? -1 : 1;
  const sort = f.sort ?? 'position';
  const byPosition = new Map(rows.map((r) => [r.id, r.position]));
  out.sort((a, b) => {
    let d = 0;
    if (sort === 'number') d = a.number - b.number;
    else if (sort === 'title') d = a.title.localeCompare(b.title);
    else if (sort === 'priority') d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    else if (sort === 'updated') d = a.updatedAt.getTime() - b.updatedAt.getTime();
    else {
      // Unassigned cases come last, as the bucket does below the tree.
      d = (suiteOrder.get(a.suiteId ?? '') ?? Infinity) - (suiteOrder.get(b.suiteId ?? '') ?? Infinity) || 0;
      if (d === 0) d = byPosition.get(a.id)! - byPosition.get(b.id)!;
    }
    return d * dir || a.number - b.number;
  });

  const pageSize = f.pageSize ?? 100;
  const page = Math.max(1, f.page ?? 1);
  return { rows: out.slice((page - 1) * pageSize, page * pageSize), total: out.length, page, pageSize };
}

/** Suites in tree order (depth first, by position), so a whole-project list reads like the tree. */
function suiteOrderIndex(suites: readonly TestSuite[]): Map<string, number> {
  const children = groupBy(suites, (s) => s.parentId);
  const order = new Map<string, number>();
  const visit = (parentId: string | null) => {
    for (const s of children.get(parentId) ?? []) {
      order.set(s.id, order.size);
      visit(s.id);
    }
  };
  visit(null);
  return order;
}

function toRow(r: TestCase, links: readonly LinkHealth[], paths: Map<string, string[]>, now: Date): CaseRow {
  const lastRunAt = links.reduce<Date | null>((acc, l) => (l.lastRunAt && (!acc || l.lastRunAt > acc) ? l.lastRunAt : acc), null);
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    suiteId: r.suiteId,
    suitePath: r.suiteId ? (paths.get(r.suiteId) ?? []) : [],
    status: r.status,
    priority: r.priority,
    severity: r.severity,
    type: r.type,
    automation: r.automation,
    muted: r.muted,
    tags: r.tags,
    linkCount: links.length,
    verdict: caseVerdict(links, now),
    lastRunAt,
    updatedAt: r.updatedAt,
  };
}

// ---------------------------------------------------------------- one case

export async function findCase(projectId: string, number: number): Promise<TestCase | null> {
  const [row] = await db
    .select()
    .from(testCases)
    .where(and(eq(testCases.projectId, projectId), eq(testCases.number, number)))
    .limit(1);
  return row ?? null;
}

export async function getCaseDetail(projectId: string, number: number, now = new Date()): Promise<CaseDetail | null> {
  const row = await findCase(projectId, number);
  if (!row) return null;
  const [suites, health, people] = await Promise.all([
    listSuites(projectId),
    linkHealth([row.id]),
    peopleNames([row.createdBy, row.updatedBy]),
  ]);
  const testRows = health.length
    ? await db
        .select({ id: tests.id, title: tests.title, titlePath: tests.titlePath, file: tests.file, pwProject: tests.pwProject })
        .from(tests)
        .where(inArray(tests.id, health.map((h) => h.testId)))
    : [];
  const byTest = new Map(testRows.map((t) => [t.id, t]));
  const links: LinkedTest[] = health
    .map((h) => {
      const t = byTest.get(h.testId)!;
      return { testId: h.testId, title: t.title, titlePath: t.titlePath, file: t.file, pwProject: t.pwProject, source: h.source, lastOutcome: h.lastOutcome, lastRunAt: h.lastRunAt, lastRunNumber: h.lastRunNumber, runs: h.runs, passed: h.passed, failed: h.failed, flaky: h.flaky };
    })
    .sort((a, b) => a.file.localeCompare(b.file) || a.title.localeCompare(b.title) || a.pwProject.localeCompare(b.pwProject));
  const base = toRow(row, health, suitePaths(suites), now);
  return {
    ...base,
    description: row.description,
    preconditions: row.preconditions,
    postconditions: row.postconditions,
    stepsFormat: row.stepsFormat,
    steps: row.steps,
    behavior: row.behavior,
    customFields: row.customFields,
    version: row.version,
    createdAt: row.createdAt,
    createdBy: row.createdBy ? (people.get(row.createdBy) ?? null) : null,
    updatedBy: row.updatedBy ? (people.get(row.updatedBy) ?? null) : null,
    links,
  };
}

async function peopleNames(ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((u) => [u.id, u.name || u.email]));
}

/** The case numbers before and after this one in the order of the list it was opened from. */
export async function caseNeighbours(projectId: string, number: number, f: CaseFilters = {}) {
  const { rows } = await listCases(projectId, { ...f, page: 1, pageSize: 100_000 });
  const i = rows.findIndex((r) => r.number === number);
  if (i < 0) return { previous: null, next: null, index: null, total: rows.length };
  return { previous: rows[i - 1]?.number ?? null, next: rows[i + 1]?.number ?? null, index: i + 1, total: rows.length };
}

// ---------------------------------------------------------------- history

export async function listCaseVersions(projectId: string, number: number): Promise<CaseVersionRow[] | null> {
  const row = await findCase(projectId, number);
  if (!row) return null;
  const [versions, suites] = await Promise.all([
    db
      .select({ v: testCaseVersions, author: users.name, email: users.email })
      .from(testCaseVersions)
      .leftJoin(users, eq(users.id, testCaseVersions.authorId))
      .where(eq(testCaseVersions.caseId, row.id))
      .orderBy(desc(testCaseVersions.version)),
    listSuites(projectId),
  ]);
  const paths = suitePaths(suites);
  return versions.map(({ v, author, email }) => ({
    version: v.version,
    changed: v.changed,
    author: author || email || null,
    createdAt: v.createdAt,
    snapshot: snapshotView(v.snapshot as Partial<CaseSnapshot>, paths),
  }));
}

export function snapshotView(s: Partial<CaseSnapshot>, paths: Map<string, string[]>): CaseSnapshotView {
  return {
    title: s.title ?? '',
    suite: s.suiteId ? (paths.get(s.suiteId)?.join(' / ') ?? 'Deleted suite') : null,
    status: s.status ?? 'active',
    priority: s.priority ?? 'none',
    severity: s.severity ?? 'normal',
    type: s.type ?? 'functional',
    behavior: s.behavior ?? 'none',
    automation: s.automation ?? 'manual',
    muted: s.muted ?? false,
    tags: s.tags ?? [],
    description: s.description ?? '',
    preconditions: s.preconditions ?? '',
    postconditions: s.postconditions ?? '',
    stepsFormat: s.stepsFormat ?? 'classic',
    steps: s.steps ?? [],
    customFields: s.customFields ?? {},
  };
}

// ---------------------------------------------------------------- coverage

export async function getCoverage(projectId: string, now = new Date()): Promise<CoverageSummary> {
  const [{ rows }, [uncovered]] = await Promise.all([
    listCases(projectId, { pageSize: 100_000 }, now),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from ${tests} t
      where t.project_id = ${projectId} and t.last_seen_at >= ${sinceDate(HEALTH_WINDOW_DAYS)}
        and not exists (select 1 from ${testCaseLinks} l where l.test_id = t.id)`),
  ]);
  const byStatus = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<CaseStatus, number>;
  const byAutomation = Object.fromEntries(CASE_AUTOMATIONS.map((s) => [s, 0])) as Record<CaseAutomation, number>;
  let unverified = 0;
  let failing = 0;
  let flaky = 0;
  let stale = 0;
  for (const r of rows) {
    byStatus[r.status]++;
    if (r.status === 'deprecated') continue;
    byAutomation[r.automation]++;
    if (r.automation === 'automated' && r.linkCount === 0) unverified++;
    if (r.verdict === 'failing') failing++;
    if (r.verdict === 'flaky') flaky++;
    if (r.verdict === 'stale') stale++;
  }
  return { total: rows.length, byStatus, byAutomation, unverified, failing, flaky, stale, uncoveredTests: num(uncovered?.n) };
}

// ---------------------------------------------------------------- automated tests

/**
 * Playwright tests of the project for the link and adopt pickers, most
 * recently seen first. `uncovered` keeps only tests no case links to yet.
 */
export async function listAutomatedTests(
  projectId: string,
  { q, uncovered, limit = 50, offset = 0 }: { q?: string; uncovered?: boolean; limit?: number; offset?: number } = {},
): Promise<{ rows: AutomatedTestOption[]; total: number }> {
  const where: SQL[] = [sql`t.project_id = ${projectId}`, sql`t.file <> 'unknown'`];
  if (q?.trim()) {
    const like = `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(sql`(t.title ilike ${like} or t.file ilike ${like} or t.title_path::text ilike ${like})`);
  }
  if (uncovered) where.push(sql`not exists (select 1 from ${testCaseLinks} l where l.test_id = t.id)`);
  const whereSql = sql.join(where, sql` and `);
  const [rows, [{ total }]] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select t.id, t.title, t.title_path, t.file, t.pw_project, t.last_seen_at,
             last.outcome as last_outcome,
             coalesce((select array_agg('TC-' || c.number order by c.number) from ${testCaseLinks} l
                       join ${testCases} c on c.id = l.case_id where l.test_id = t.id), '{}') as linked
      from ${tests} t
      left join lateral (
        select tr.outcome from ${testResults} tr where tr.test_id = t.id and tr.outcome <> 'running'
        order by tr.started_at desc limit 1
      ) last on true
      where ${whereSql}
      order by t.last_seen_at desc, t.file, t.title
      limit ${limit} offset ${offset}`),
    db.execute<{ total: number }>(sql`select count(*)::int as total from ${tests} t where ${whereSql}`),
  ]);
  return {
    total: num(total),
    rows: Array.from(rows).map((r) => ({
      testId: String(r.id),
      title: String(r.title),
      titlePath: (r.title_path as string[]) ?? [],
      file: String(r.file),
      pwProject: String(r.pw_project),
      lastRunAt: r.last_seen_at ? new Date(r.last_seen_at as string) : null,
      lastOutcome: (r.last_outcome as string | null) ?? null,
      linkedCases: (r.linked as string[]) ?? [],
    })),
  };
}

// ---------------------------------------------------------------- fields and tags

export async function listFieldDefs(projectId: string): Promise<CaseFieldDef[]> {
  const rows = await db
    .select()
    .from(testCaseFields)
    .where(eq(testCaseFields.projectId, projectId))
    .orderBy(asc(testCaseFields.position), asc(testCaseFields.createdAt));
  return rows.map((r) => ({ key: r.key, label: r.label, kind: r.kind, options: r.options, required: r.required }));
}

export async function listCaseTags(projectId: string): Promise<string[]> {
  const rows = await db.execute<{ tag: string }>(
    sql`select distinct unnest(tags) as tag from ${testCases} where project_id = ${projectId} order by 1`,
  );
  return Array.from(rows).map((r) => r.tag);
}

export { caseKey };
