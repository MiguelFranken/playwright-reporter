/**
 * Every write to the test case library. Server actions, MCP tools and the
 * importer all come through here, so validation, versioning, the automation
 * rules and the audit trail live once.
 *
 * Errors a caller should show are `CaseError`s; anything else is a bug.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  projects,
  testAttempts,
  testCaseFields,
  testCaseLinks,
  testCases,
  testCaseVersions,
  testResults,
  tests,
  testSuites,
  type TestCase,
  type TestSuite,
} from '@/lib/db/schema';
import { audit } from '@/lib/auth/audit';
import { caseKey, MAX_BULK_CASES, MAX_SUITE_DEPTH, type CaseStep, type CustomFieldValue } from '@miguelfranken/ui/lib/test-cases';
import {
  CASE_DEFAULTS,
  caseFieldsSchema,
  changedFields,
  coerceCustomFields,
  createCaseSchema,
  fieldDefSchema,
  firstIssue,
  LIMITS,
  snapshotOf,
  suiteFieldsSchema,
  tagsSchema,
  updateCaseSchema,
  type CaseFields,
  type CaseSnapshot,
  type FieldDefInput,
} from './model';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export interface CaseContext {
  projectId: string;
  teamId: string;
  /** Null for writes nobody is signed in for (ingest). */
  actorId: string | null;
}

export class CaseError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'not_found' | 'conflict' = 'invalid',
  ) {
    super(message);
    this.name = 'CaseError';
  }
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new CaseError(firstIssue(result.error));
  return result.data;
}

async function record(ctx: CaseContext, action: Parameters<typeof audit>[0], target: Record<string, unknown>) {
  await audit(action, { actorId: ctx.actorId, teamId: ctx.teamId, projectId: ctx.projectId, target });
}

// ---------------------------------------------------------------- suites

async function suitesOf(tx: Db, projectId: string): Promise<TestSuite[]> {
  return tx.select().from(testSuites).where(eq(testSuites.projectId, projectId));
}

function depthOf(suites: readonly TestSuite[], id: string | null): number {
  let depth = 0;
  const byId = new Map(suites.map((s) => [s.id, s]));
  for (let cur = id ? byId.get(id) : undefined; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    depth++;
    if (depth > MAX_SUITE_DEPTH + 1) break;
  }
  return depth;
}

function heightOf(suites: readonly TestSuite[], id: string): number {
  const kids = suites.filter((s) => s.parentId === id);
  return 1 + (kids.length ? Math.max(...kids.map((k) => heightOf(suites, k.id))) : 0);
}

async function requireSuite(tx: Db, projectId: string, id: string): Promise<TestSuite> {
  const [row] = await tx.select().from(testSuites).where(and(eq(testSuites.id, id), eq(testSuites.projectId, projectId)));
  if (!row) throw new CaseError('That suite does not exist.', 'not_found');
  return row;
}

export async function createSuite(ctx: CaseContext, input: z.input<typeof suiteFieldsSchema>): Promise<TestSuite> {
  const fields = parse(suiteFieldsSchema, input);
  const suite = await db.transaction(async (tx) => {
    const suites = await suitesOf(tx, ctx.projectId);
    if (fields.parentId) {
      if (!suites.some((s) => s.id === fields.parentId)) throw new CaseError('The parent suite does not exist.', 'not_found');
      if (depthOf(suites, fields.parentId) >= MAX_SUITE_DEPTH) throw new CaseError(`Suites nest at most ${MAX_SUITE_DEPTH} levels deep.`);
    }
    const siblings = suites.filter((s) => s.parentId === fields.parentId);
    const [row] = await tx
      .insert(testSuites)
      .values({
        id: randomUUID(),
        projectId: ctx.projectId,
        parentId: fields.parentId,
        name: fields.name,
        description: fields.description,
        position: siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 0,
      })
      .returning();
    return row;
  });
  await record(ctx, 'test-suite.create', { suiteId: suite.id, name: suite.name });
  return suite;
}

export async function updateSuite(ctx: CaseContext, id: string, input: { name?: string; description?: string; parentId?: string | null }): Promise<TestSuite> {
  const fields = parse(suiteFieldsSchema.partial(), input);
  const suite = await db.transaction(async (tx) => {
    const current = await requireSuite(tx, ctx.projectId, id);
    const patch: Partial<TestSuite> = { updatedAt: new Date() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.parentId !== undefined && fields.parentId !== current.parentId) {
      const suites = await suitesOf(tx, ctx.projectId);
      if (fields.parentId) {
        if (!suites.some((s) => s.id === fields.parentId)) throw new CaseError('The parent suite does not exist.', 'not_found');
        // A suite cannot move into itself or below itself.
        for (let cur: string | null = fields.parentId; cur; cur = suites.find((s) => s.id === cur)?.parentId ?? null) {
          if (cur === id) throw new CaseError('A suite cannot move into one of its own sub-suites.');
        }
        if (depthOf(suites, fields.parentId) + heightOf(suites, id) > MAX_SUITE_DEPTH) {
          throw new CaseError(`Suites nest at most ${MAX_SUITE_DEPTH} levels deep.`);
        }
      }
      const siblings = suites.filter((s) => s.parentId === fields.parentId);
      patch.parentId = fields.parentId;
      patch.position = siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 0;
    }
    const [row] = await tx.update(testSuites).set(patch).where(eq(testSuites.id, id)).returning();
    return row;
  });
  await record(ctx, 'test-suite.update', { suiteId: id, fields: Object.keys(input) });
  return suite;
}

/** Deletes a suite, its sub-suites and every case in them. */
export async function deleteSuite(ctx: CaseContext, id: string): Promise<{ cases: number }> {
  const result = await db.transaction(async (tx) => {
    const suite = await requireSuite(tx, ctx.projectId, id);
    const suites = await suitesOf(tx, ctx.projectId);
    const ids = subtree(suites, id);
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(testCases)
      .where(and(eq(testCases.projectId, ctx.projectId), inArray(testCases.suiteId, ids)));
    await tx.delete(testSuites).where(eq(testSuites.id, id));
    return { name: suite.name, cases: n };
  });
  await record(ctx, 'test-suite.delete', { suiteId: id, name: result.name, cases: result.cases });
  return { cases: result.cases };
}

function subtree(suites: readonly TestSuite[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const s of suites) if (s.parentId === out[i]) out.push(s.id);
  return out;
}

/** Swaps a suite with its neighbour above or below. */
export async function reorderSuite(ctx: CaseContext, id: string, direction: 'up' | 'down'): Promise<void> {
  await db.transaction(async (tx) => {
    const suite = await requireSuite(tx, ctx.projectId, id);
    const siblings = await tx
      .select()
      .from(testSuites)
      .where(and(eq(testSuites.projectId, ctx.projectId), suite.parentId ? eq(testSuites.parentId, suite.parentId) : isNull(testSuites.parentId)))
      .orderBy(asc(testSuites.position), asc(testSuites.name));
    await swapNeighbour(siblings, id, direction, (row, position) => tx.update(testSuites).set({ position }).where(eq(testSuites.id, row.id)));
  });
}

async function swapNeighbour<T extends { id: string }>(ordered: T[], id: string, direction: 'up' | 'down', write: (row: T, position: number) => Promise<unknown>) {
  const i = ordered.findIndex((r) => r.id === id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ordered.length) return;
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  // Renumber the whole run: positions may have gaps or ties from earlier moves.
  await Promise.all(ordered.map((row, position) => write(row, position)));
}

// ---------------------------------------------------------------- cases

async function requireCase(tx: Db, projectId: string, id: string): Promise<TestCase> {
  const [row] = await tx.select().from(testCases).where(and(eq(testCases.id, id), eq(testCases.projectId, projectId))).for('update');
  if (!row) throw new CaseError('That test case does not exist.', 'not_found');
  return row;
}

/** Finds a case by its id or its key (`TC-12`, `12`). */
export async function resolveCaseId(projectId: string, ref: string): Promise<string> {
  const n = /^\s*(?:tc-|#)?(\d{1,9})\s*$/i.exec(ref);
  const where = n
    ? and(eq(testCases.projectId, projectId), eq(testCases.number, Number(n[1])))
    : /^[0-9a-f-]{36}$/i.test(ref)
      ? and(eq(testCases.projectId, projectId), eq(testCases.id, ref))
      : undefined;
  if (!where) throw new CaseError(`"${ref}" is not a test case key.`, 'not_found');
  const [row] = await db.select({ id: testCases.id }).from(testCases).where(where);
  if (!row) throw new CaseError(`Test case ${ref} does not exist.`, 'not_found');
  return row.id;
}

async function fieldDefs(tx: Db, projectId: string) {
  const rows = await tx.select().from(testCaseFields).where(eq(testCaseFields.projectId, projectId)).orderBy(asc(testCaseFields.position));
  return rows.map((r) => ({ key: r.key, label: r.label, kind: r.kind, options: r.options, required: r.required }));
}

async function nextPosition(tx: Db, projectId: string, suiteId: string | null): Promise<number> {
  const [{ top }] = await tx
    .select({ top: max(testCases.position) })
    .from(testCases)
    .where(and(eq(testCases.projectId, projectId), suiteId ? eq(testCases.suiteId, suiteId) : isNull(testCases.suiteId)));
  return top === null ? 0 : top + 1;
}

async function allocateNumbers(tx: Db, projectId: string, count: number): Promise<number[]> {
  const [{ caseCounter }] = await tx
    .update(projects)
    .set({ caseCounter: sql`${projects.caseCounter} + ${count}` })
    .where(eq(projects.id, projectId))
    .returning({ caseCounter: projects.caseCounter });
  return Array.from({ length: count }, (_, i) => caseCounter - count + 1 + i);
}

async function insertCase(ctx: CaseContext, tx: Tx, fields: CaseFields, number: number): Promise<TestCase> {
  if (fields.suiteId) await requireSuite(tx, ctx.projectId, fields.suiteId);
  const [row] = await tx
    .insert(testCases)
    .values({
      id: randomUUID(),
      projectId: ctx.projectId,
      number,
      position: await nextPosition(tx, ctx.projectId, fields.suiteId),
      ...fields,
      createdBy: ctx.actorId,
      updatedBy: ctx.actorId,
    })
    .returning();
  await tx.insert(testCaseVersions).values({
    id: randomUUID(),
    caseId: row.id,
    version: 1,
    snapshot: snapshotOf(fields),
    changed: [],
    authorId: ctx.actorId,
  });
  return row;
}

async function validFields(tx: Db, ctx: CaseContext, input: unknown): Promise<CaseFields> {
  const partial = parse(createCaseSchema, input);
  const fields = { ...CASE_DEFAULTS, suiteId: null, ...partial } as CaseFields;
  const custom = coerceCustomFields(await fieldDefs(tx, ctx.projectId), fields.customFields, { requireAll: true });
  if (!custom.ok) throw new CaseError(custom.message);
  return { ...fields, customFields: custom.value };
}

export async function createCase(ctx: CaseContext, input: z.input<typeof createCaseSchema>): Promise<TestCase> {
  const row = await db.transaction(async (tx) => {
    const fields = await validFields(tx, ctx, input);
    const [number] = await allocateNumbers(tx, ctx.projectId, 1);
    return insertCase(ctx, tx, fields, number);
  });
  await record(ctx, 'test-case.create', { caseId: row.id, key: caseKey(row.number) });
  return row;
}

export interface UpdateOptions {
  /** Refuses the edit when the case moved on since the editor loaded it. */
  expectedVersion?: number;
}

/**
 * Applies an edit and records it as a new version. An edit that changes
 * nothing leaves the case (and its version) as it was.
 */
async function applyUpdate(ctx: CaseContext, tx: Tx, current: TestCase, patch: Partial<CaseFields>, opts: UpdateOptions = {}) {
  if (opts.expectedVersion !== undefined && opts.expectedVersion !== current.version) {
    throw new CaseError(`${caseKey(current.number)} was changed by someone else in the meantime. Reload it to see their changes.`, 'conflict');
  }
  const before = snapshotOf(current as CaseSnapshot);
  const next = { ...before, ...patch } as CaseSnapshot;
  if (patch.suiteId) await requireSuite(tx, ctx.projectId, patch.suiteId);
  if (patch.customFields !== undefined) {
    const custom = coerceCustomFields(await fieldDefs(tx, ctx.projectId), patch.customFields, { requireAll: true });
    if (!custom.ok) throw new CaseError(custom.message);
    next.customFields = custom.value;
  }
  // A case is automated because a test covers it; without one it goes back to "to be automated".
  const changed = changedFields(before, next);
  if (changed.length === 0) return { row: current, changed };
  const set: Partial<TestCase> = { ...next, version: current.version + 1, updatedBy: ctx.actorId, updatedAt: new Date() };
  if (changed.includes('suiteId')) set.position = await nextPosition(tx, ctx.projectId, next.suiteId);
  const [row] = await tx.update(testCases).set(set).where(eq(testCases.id, current.id)).returning();
  await tx.insert(testCaseVersions).values({
    id: randomUUID(),
    caseId: current.id,
    version: row.version,
    snapshot: snapshotOf(next),
    changed,
    authorId: ctx.actorId,
  });
  return { row, changed };
}

export async function updateCase(ctx: CaseContext, id: string, input: z.input<typeof updateCaseSchema>, opts: UpdateOptions = {}): Promise<TestCase> {
  const patch = parse(updateCaseSchema, input);
  const { row, changed } = await db.transaction(async (tx) => applyUpdate(ctx, tx, await requireCase(tx, ctx.projectId, id), patch, opts));
  if (changed.length) await record(ctx, 'test-case.update', { caseId: id, key: caseKey(row.number), fields: changed });
  return row;
}

/** Brings back the fields of an earlier version, as a new version. A suite deleted since stays unassigned. */
export async function restoreVersion(ctx: CaseContext, id: string, version: number): Promise<TestCase> {
  const { row, changed } = await db.transaction(async (tx) => {
    const current = await requireCase(tx, ctx.projectId, id);
    const [old] = await tx
      .select()
      .from(testCaseVersions)
      .where(and(eq(testCaseVersions.caseId, id), eq(testCaseVersions.version, version)));
    if (!old) throw new CaseError(`${caseKey(current.number)} has no version ${version}.`, 'not_found');
    const snapshot = { ...CASE_DEFAULTS, suiteId: null, ...(old.snapshot as Partial<CaseSnapshot>) } as CaseSnapshot;
    if (snapshot.suiteId) {
      const [suite] = await tx.select({ id: testSuites.id }).from(testSuites).where(eq(testSuites.id, snapshot.suiteId));
      if (!suite) snapshot.suiteId = null;
    }
    // Automation follows the links, which a restore does not touch.
    const { automation: _, ...fields } = parse(caseFieldsSchema, snapshot);
    return applyUpdate(ctx, tx, current, fields);
  });
  if (changed.length) await record(ctx, 'test-case.restore', { caseId: id, key: caseKey(row.number), version, fields: changed });
  return row;
}

export async function deleteCases(ctx: CaseContext, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  if (ids.length > MAX_BULK_CASES) throw new CaseError(`Select at most ${MAX_BULK_CASES} test cases at once.`);
  const deleted = await db
    .delete(testCases)
    .where(and(eq(testCases.projectId, ctx.projectId), inArray(testCases.id, [...ids])))
    .returning({ id: testCases.id, number: testCases.number });
  if (deleted.length) await record(ctx, 'test-case.delete', { keys: deleted.map((d) => caseKey(d.number)) });
  return deleted.length;
}

/** Moves a case up or down among the cases of its suite. */
export async function reorderCase(ctx: CaseContext, id: string, direction: 'up' | 'down'): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await requireCase(tx, ctx.projectId, id);
    const siblings = await tx
      .select({ id: testCases.id })
      .from(testCases)
      .where(and(eq(testCases.projectId, ctx.projectId), current.suiteId ? eq(testCases.suiteId, current.suiteId) : isNull(testCases.suiteId)))
      .orderBy(asc(testCases.position), asc(testCases.number));
    await swapNeighbour(siblings, id, direction, (row, position) => tx.update(testCases).set({ position }).where(eq(testCases.id, row.id)));
  });
}

// ---------------------------------------------------------------- bulk

export const bulkPatchSchema = z.object({
  suiteId: z.uuid().nullable().optional(),
  status: caseFieldsSchema.shape.status.optional(),
  priority: caseFieldsSchema.shape.priority.optional(),
  severity: caseFieldsSchema.shape.severity.optional(),
  type: caseFieldsSchema.shape.type.optional(),
  behavior: caseFieldsSchema.shape.behavior.optional(),
  automation: caseFieldsSchema.shape.automation.optional(),
  muted: z.boolean().optional(),
  addTags: tagsSchema.optional(),
  removeTags: tagsSchema.optional(),
});
export type BulkPatch = z.input<typeof bulkPatchSchema>;

/**
 * One edit applied to many cases in one transaction; each changed case gets
 * its own version. Tags are added to or removed from what each case has.
 */
export async function bulkUpdate(ctx: CaseContext, ids: readonly string[], input: BulkPatch): Promise<{ updated: number }> {
  const { addTags, removeTags, ...patch } = parse(bulkPatchSchema, input);
  if (ids.length === 0) return { updated: 0 };
  if (ids.length > MAX_BULK_CASES) throw new CaseError(`Select at most ${MAX_BULK_CASES} test cases at once.`);
  const results = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(testCases)
      .where(and(eq(testCases.projectId, ctx.projectId), inArray(testCases.id, [...ids])))
      .orderBy(asc(testCases.position), asc(testCases.number))
      .for('update');
    const out: { number: number; changed: string[] }[] = [];
    for (const row of rows) {
      const fields: Partial<CaseFields> = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (addTags?.length || removeTags?.length) {
        const remove = new Set((removeTags ?? []).map((t) => t.toLowerCase()));
        fields.tags = parse(tagsSchema, [...row.tags, ...(addTags ?? [])].filter((t) => !remove.has(t.toLowerCase())));
      }
      const { row: updated, changed } = await applyUpdate(ctx, tx, row, fields);
      if (changed.length) out.push({ number: updated.number, changed });
    }
    return out;
  });
  if (results.length) {
    await record(ctx, 'test-case.update', { keys: results.map((r) => caseKey(r.number)), fields: [...new Set(results.flatMap((r) => r.changed))], bulk: true });
  }
  return { updated: results.length };
}

// ---------------------------------------------------------------- links

async function projectTests(tx: Db, projectId: string, testIds: readonly string[]) {
  if (testIds.length === 0) return [];
  return tx
    .select({ id: tests.id })
    .from(tests)
    .where(and(eq(tests.projectId, projectId), inArray(tests.id, [...testIds])));
}

async function markAutomated(tx: Db, ctx: CaseContext, caseIds: readonly string[]) {
  if (caseIds.length === 0) return;
  const rows = await tx
    .select()
    .from(testCases)
    .where(and(inArray(testCases.id, [...caseIds]), sql`${testCases.automation} <> 'automated'`));
  for (const row of rows) await applyUpdate(ctx, tx as Tx, row, { automation: 'automated' });
}

/** Links Playwright tests to a case by hand. Already linked tests stay as they are. */
export async function linkTests(ctx: CaseContext, caseId: string, testIds: readonly string[]): Promise<{ linked: number }> {
  const result = await db.transaction(async (tx) => {
    const current = await requireCase(tx, ctx.projectId, caseId);
    const valid = await projectTests(tx, ctx.projectId, testIds);
    if (valid.length !== new Set(testIds).size) throw new CaseError('Some of those tests do not belong to this project.', 'not_found');
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(testCaseLinks).where(eq(testCaseLinks.caseId, caseId));
    if (n + valid.length > LIMITS.linksPerCase) throw new CaseError(`A test case links at most ${LIMITS.linksPerCase} tests.`);
    const inserted = valid.length
      ? await tx
          .insert(testCaseLinks)
          .values(valid.map((t) => ({ caseId, testId: t.id, source: 'manual' as const, createdBy: ctx.actorId })))
          .onConflictDoNothing()
          .returning({ testId: testCaseLinks.testId })
      : [];
    if (inserted.length) await markAutomated(tx, ctx, [caseId]);
    return { number: current.number, linked: inserted.length };
  });
  if (result.linked) await record(ctx, 'test-case.link', { caseId, key: caseKey(result.number), tests: result.linked });
  return { linked: result.linked };
}

/**
 * Removes a link. A code link comes back with the next run while the test
 * still names the case, which the caller should say.
 */
export async function unlinkTest(ctx: CaseContext, caseId: string, testId: string): Promise<{ source: 'manual' | 'code' | null }> {
  const result = await db.transaction(async (tx) => {
    const current = await requireCase(tx, ctx.projectId, caseId);
    const [removed] = await tx
      .delete(testCaseLinks)
      .where(and(eq(testCaseLinks.caseId, caseId), eq(testCaseLinks.testId, testId)))
      .returning({ source: testCaseLinks.source });
    if (removed) await demoteUnlinked(tx, ctx, [caseId]);
    return { number: current.number, source: removed?.source ?? null };
  });
  if (result.source) await record(ctx, 'test-case.unlink', { caseId, key: caseKey(result.number), testId });
  return { source: result.source };
}

/** Cases that just lost their last link are automated no longer. */
async function demoteUnlinked(tx: Db, ctx: CaseContext, caseIds: readonly string[]) {
  if (caseIds.length === 0) return;
  const rows = await tx
    .select()
    .from(testCases)
    .where(
      and(
        inArray(testCases.id, [...caseIds]),
        eq(testCases.automation, 'automated'),
        sql`not exists (select 1 from ${testCaseLinks} l where l.case_id = ${testCases.id})`,
      ),
    );
  for (const row of rows) await applyUpdate(ctx, tx as Tx, row, { automation: 'planned' });
}

/**
 * Keeps the code links of the tests a run just began in step with their tags
 * and annotations: a test that names `TC-12` links to it, a test that stopped
 * naming it loses that link. Links made by hand are never touched. Cases the
 * test names that do not exist are ignored.
 *
 * Runs inside the ingest transaction, once per batch. A project without cases
 * costs nothing.
 */
export async function syncCodeLinks(
  tx: Tx,
  project: { id: string; teamId: string; caseCounter: number },
  batch: readonly { testId: string; refs: readonly number[] }[],
): Promise<void> {
  // The project row was read for this request: without a single case there is nothing to link or unlink.
  if (batch.length === 0 || project.caseCounter === 0) return;
  const { id: projectId, teamId } = project;
  const testIds = [...new Set(batch.map((b) => b.testId))];
  const wanted = [...new Set(batch.flatMap((b) => b.refs))];
  const cases = wanted.length
    ? await tx
        .select({ id: testCases.id, number: testCases.number })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), inArray(testCases.number, wanted)))
    : [];
  const caseByNumber = new Map(cases.map((c) => [c.number, c.id]));
  const want = new Set<string>();
  for (const b of batch) for (const n of b.refs) if (caseByNumber.has(n)) want.add(`${caseByNumber.get(n)}|${b.testId}`);

  const existing = await tx
    .select({ caseId: testCaseLinks.caseId, testId: testCaseLinks.testId })
    .from(testCaseLinks)
    .where(and(inArray(testCaseLinks.testId, testIds), eq(testCaseLinks.source, 'code')));
  const stale = existing.filter((l) => !want.has(`${l.caseId}|${l.testId}`));
  const have = new Set(existing.map((l) => `${l.caseId}|${l.testId}`));
  const fresh = [...want].filter((k) => !have.has(k)).map((k) => k.split('|') as [string, string]);

  const ctx: CaseContext = { projectId, teamId, actorId: null };
  for (const l of stale) {
    await tx.delete(testCaseLinks).where(and(eq(testCaseLinks.caseId, l.caseId), eq(testCaseLinks.testId, l.testId), eq(testCaseLinks.source, 'code')));
  }
  if (fresh.length) {
    await tx
      .insert(testCaseLinks)
      .values(fresh.map(([caseId, testId]) => ({ caseId, testId, source: 'code' as const })))
      .onConflictDoNothing();
    await markAutomated(tx, ctx, [...new Set(fresh.map(([caseId]) => caseId))]);
  }
  if (stale.length) await demoteUnlinked(tx, ctx, [...new Set(stale.map((l) => l.caseId))]);
}

// ---------------------------------------------------------------- adopt

export const adoptSchema = z.object({
  testIds: z.array(z.uuid()).min(1, 'Pick at least one test.').max(MAX_BULK_CASES),
  /** `target`: every new case goes into `suiteId`. `mirror`: suites follow each test's file and describe blocks. */
  mode: z.enum(['target', 'mirror']).default('mirror'),
  suiteId: z.uuid().nullable().default(null),
  status: caseFieldsSchema.shape.status.default('active'),
});

/**
 * Turns Playwright tests into test cases that are already linked to them:
 * the title is the test's, the steps are its `test.step`s from the latest
 * run, and (in `mirror` mode) the suites follow its file and describe path.
 * A test that already backs a case is skipped.
 */
export async function adoptTests(ctx: CaseContext, input: z.input<typeof adoptSchema>): Promise<{ created: { id: string; number: number }[]; skipped: number }> {
  const opts = parse(adoptSchema, input);
  const result = await db.transaction(async (tx) => {
    if (opts.mode === 'target' && opts.suiteId) await requireSuite(tx, ctx.projectId, opts.suiteId);
    const rows = await tx
      .select({ id: tests.id, title: tests.title, titlePath: tests.titlePath, file: tests.file, pwProject: tests.pwProject, tags: tests.tags })
      .from(tests)
      .where(
        and(
          eq(tests.projectId, ctx.projectId),
          inArray(tests.id, opts.testIds),
          sql`not exists (select 1 from ${testCaseLinks} l where l.test_id = ${tests.id})`,
        ),
      )
      .orderBy(asc(tests.file), asc(tests.title));
    // The same test in several Playwright projects (browsers) becomes one case.
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.file}\u0000${describePath(r.titlePath, r.file, r.pwProject).join('\u0000')}\u0000${r.title}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const suiteCache = new Map<string, string>();
    const suites = await suitesOf(tx, ctx.projectId);
    const numbers = await allocateNumbers(tx, ctx.projectId, groups.size);
    const created: { id: string; number: number }[] = [];
    let i = 0;
    for (const group of groups.values()) {
      const first = group[0];
      const suiteId =
        opts.mode === 'target'
          ? opts.suiteId
          : await ensureSuitePath(tx, ctx, suites, suiteCache, [fileLabel(first.file), ...describePath(first.titlePath, first.file, first.pwProject)]);
      const steps = await latestSteps(tx, group.map((g) => g.id));
      const fields: CaseFields = {
        ...CASE_DEFAULTS,
        title: first.title.slice(0, LIMITS.title),
        suiteId,
        status: opts.status,
        automation: 'automated',
        tags: parse(tagsSchema, first.tags.filter((t) => !/^@?tc-\d+$/i.test(t))),
        steps,
      };
      const row = await insertCase(ctx, tx, fields, numbers[i++]);
      await tx.insert(testCaseLinks).values(group.map((g) => ({ caseId: row.id, testId: g.id, source: 'manual' as const, createdBy: ctx.actorId })));
      created.push({ id: row.id, number: row.number });
    }
    return { created, skipped: opts.testIds.length - rows.length };
  });
  if (result.created.length) await record(ctx, 'test-case.create', { keys: result.created.map((c) => caseKey(c.number)), adopted: true });
  return result;
}

/** The describe blocks around a test: its title path without the project, the file and the title itself. */
export function describePath(titlePath: readonly string[], file: string, pwProject: string): string[] {
  const inner = titlePath.slice(0, -1).filter((p) => p && p !== pwProject && p !== file && !file.endsWith(p));
  return inner.map((p) => p.trim()).filter(Boolean);
}

/** `tests/checkout/cart.spec.ts` → `cart`. */
export function fileLabel(file: string): string {
  const base = file.split('/').pop() ?? file;
  return base.replace(/\.(spec|test)\.[cm]?[jt]sx?$/i, '').replace(/\.[cm]?[jt]sx?$/i, '') || base;
}

async function ensureSuitePath(tx: Tx, ctx: CaseContext, suites: TestSuite[], cache: Map<string, string>, path: string[]): Promise<string | null> {
  let parentId: string | null = null;
  const trimmedPath = path.slice(0, MAX_SUITE_DEPTH);
  for (let depth = 0; depth < trimmedPath.length; depth++) {
    const name = trimmedPath[depth].slice(0, LIMITS.suiteName);
    const key: string = `${parentId ?? ''}/${name}`;
    let id: string | undefined = cache.get(key) ?? suites.find((s) => s.parentId === parentId && s.name === name)?.id;
    if (!id) {
      const siblings = suites.filter((s) => s.parentId === parentId);
      const [row]: TestSuite[] = await tx
        .insert(testSuites)
        .values({ id: randomUUID(), projectId: ctx.projectId, parentId, name, position: siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 0 })
        .returning();
      suites.push(row);
      id = row.id;
    }
    cache.set(key, id!);
    parentId = id!;
  }
  return parentId;
}

/** The top-level `test.step`s of the latest attempt (of any of the tests) that reported some, as classic steps. */
async function latestSteps(tx: Tx, testIds: readonly string[]): Promise<CaseStep[]> {
  const [latest] = await tx
    .select({ steps: testAttempts.steps })
    .from(testAttempts)
    .innerJoin(testResults, eq(testResults.id, testAttempts.testResultId))
    .where(and(inArray(testResults.testId, [...testIds]), sql`${testAttempts.steps} @> '[{"category":"test.step"}]'::jsonb`))
    .orderBy(sql`${testAttempts.startedAt} desc`)
    .limit(1);
  if (!latest) return [];
  const top = latest.steps.filter((s) => s.category === 'test.step');
  const minDepth = top.length ? Math.min(...top.map((s) => s.depth)) : 0;
  return top
    .filter((s) => s.depth === minDepth)
    .slice(0, LIMITS.steps)
    .map((s) => ({ action: s.title.slice(0, LIMITS.stepText), data: '', expected: '', keyword: 'given' as const }));
}

// ---------------------------------------------------------------- custom fields

/**
 * Replaces the project's custom field definitions. Values of a removed field
 * stay in the cases' history but are no longer shown or edited.
 */
export async function saveFieldDefs(ctx: CaseContext, input: FieldDefInput[]): Promise<void> {
  const defs = parse(z.array(fieldDefSchema).max(LIMITS.fields), input);
  const keys = defs.map((d) => d.key);
  if (new Set(keys).size !== keys.length) throw new CaseError('Two fields share a key.');
  await db.transaction(async (tx) => {
    await tx.delete(testCaseFields).where(eq(testCaseFields.projectId, ctx.projectId));
    if (defs.length) {
      await tx.insert(testCaseFields).values(defs.map((d, position) => ({ id: randomUUID(), projectId: ctx.projectId, ...d, position })));
    }
  });
  await record(ctx, 'test-case-field.update', { keys });
}

export type { CustomFieldValue };
