import { eq } from 'drizzle-orm';
import { auditLogs, projects, testCaseLinks, testCases, tests } from '@/lib/db/schema';
import {
  getCaseDetail,
  getCoverage,
  getSuiteTree,
  listAutomatedTests,
  listCases,
  listCaseVersions,
} from '@/lib/db/queries/test-cases';
import {
  adoptTests,
  bulkUpdate,
  CaseError,
  createCase,
  createSuite,
  deleteCases,
  deleteSuite,
  describePath,
  fileLabel,
  linkTests,
  reorderCase,
  restoreVersion,
  saveFieldDefs,
  unlinkTest,
  updateCase,
  updateSuite,
  type CaseContext,
} from '@/lib/test-cases/service';
import { playRun, type Scenario } from './factories';
import { createTenant, describe, expect, test, type Db, type Tenant } from './fixtures';

function ctxOf(tenant: Tenant): CaseContext {
  return { projectId: tenant.project.id, teamId: tenant.team.id, actorId: tenant.adminUser.id };
}

/** Ingest reads the project row per request; a test's tenant holds a snapshot, so re-read it. */
async function run(db: Db, tenant: Tenant, scenario: Scenario) {
  const [project] = await db.select().from(projects).where(eq(projects.id, tenant.project.id));
  return playRun({ ...project, teamSlug: tenant.team.slug }, scenario);
}

async function testIdByTitle(db: Db, tenant: Tenant, title: string) {
  const rows = await db.select({ id: tests.id, title: tests.title }).from(tests).where(eq(tests.projectId, tenant.project.id));
  return rows.filter((r) => r.title === title).map((r) => r.id);
}

describe('suites', () => {
  test('nest, count and refuse a seventh level', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    let parent: string | null = null;
    const ids: string[] = [];
    for (let level = 1; level <= 6; level++) {
      const suite = await createSuite(ctx, { name: `Level ${level}`, parentId: parent });
      ids.push(suite.id);
      parent = suite.id;
    }
    await expect(createSuite(ctx, { name: 'Level 7', parentId: parent })).rejects.toThrow(/6 levels/);

    await createCase(ctx, { title: 'Deep', suiteId: ids[5] });
    await createCase(ctx, { title: 'Shallow', suiteId: ids[0] });
    await createCase(ctx, { title: 'Loose' });
    const tree = await getSuiteTree(tenant.project.id);
    expect(tree.total).toBe(3);
    expect(tree.unassigned).toBe(1);
    expect(tree.roots[0]).toMatchObject({ name: 'Level 1', caseCount: 1, totalCount: 2, depth: 0 });
  });

  test('cannot move into their own subtree or beyond the depth limit', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    const a = await createSuite(ctx, { name: 'A' });
    const b = await createSuite(ctx, { name: 'B', parentId: a.id });
    await expect(updateSuite(ctx, a.id, { parentId: b.id })).rejects.toThrow(/own sub-suites/);

    let deep = (await createSuite(ctx, { name: 'D1' })).id;
    for (let i = 2; i <= 5; i++) deep = (await createSuite(ctx, { name: `D${i}`, parentId: deep })).id;
    // A (with B below it) would end up at levels 6 and 7.
    await expect(updateSuite(ctx, a.id, { parentId: deep })).rejects.toThrow(/6 levels/);
    await expect(updateSuite(ctx, a.id, { name: 'Renamed' })).resolves.toMatchObject({ name: 'Renamed' });
  });

  test('delete their sub-suites and cases with them', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    const a = await createSuite(ctx, { name: 'A' });
    const b = await createSuite(ctx, { name: 'B', parentId: a.id });
    await createCase(ctx, { title: 'one', suiteId: a.id });
    await createCase(ctx, { title: 'two', suiteId: b.id });
    const keep = await createCase(ctx, { title: 'kept' });
    await expect(deleteSuite(ctx, a.id)).resolves.toEqual({ cases: 2 });
    const left = await db.select({ id: testCases.id }).from(testCases).where(eq(testCases.projectId, tenant.project.id));
    expect(left.map((r) => r.id)).toEqual([keep.id]);
  });
});

describe('cases', () => {
  test('number per project, validate custom fields and record versions', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    const other = await createTenant(db);
    await createCase(ctxOf(other), { title: 'elsewhere' });

    await saveFieldDefs(ctx, [
      { key: 'owner', label: 'Owner', kind: 'text', required: true },
      { key: 'area', label: 'Area', kind: 'select', options: ['Cart', 'Auth'] },
    ]);
    await expect(createCase(ctx, { title: 'No owner' })).rejects.toThrow('Owner is required.');
    const first = await createCase(ctx, { title: 'Log in', customFields: { owner: 'Kim', area: 'Auth', unknown: 'x' } });
    const second = await createCase(ctx, { title: 'Log out', customFields: { owner: 'Kim' } });
    expect([first.number, second.number]).toEqual([1, 2]);
    expect(first.customFields).toEqual({ owner: 'Kim', area: 'Auth' });

    const edited = await updateCase(ctx, first.id, { title: 'Log in with a password', tags: ['@smoke'] }, { expectedVersion: 1 });
    expect(edited).toMatchObject({ version: 2, tags: ['smoke'] });
    // Saving the same values again is not a new version.
    await updateCase(ctx, first.id, { title: 'Log in with a password' });
    await expect(updateCase(ctx, first.id, { title: 'Stale edit' }, { expectedVersion: 1 })).rejects.toMatchObject({ code: 'conflict' });

    const versions = await listCaseVersions(tenant.project.id, first.number);
    expect(versions!.map((v) => [v.version, v.changed])).toEqual([
      [2, ['title', 'tags']],
      [1, []],
    ]);
    expect(versions![1].author).toBe('Team admin');

    const restored = await restoreVersion(ctx, first.id, 1);
    expect(restored).toMatchObject({ version: 3, title: 'Log in', tags: [] });
    const actions = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.projectId, tenant.project.id));
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(['test-case.create', 'test-case.update', 'test-case.restore', 'test-case-field.update']));
  });

  test('refuse a suite of another project', async ({ db, tenant }) => {
    const other = await createTenant(db);
    const foreign = await createSuite(ctxOf(other), { name: 'Theirs' });
    await expect(createCase(ctxOf(tenant), { title: 'x', suiteId: foreign.id })).rejects.toBeInstanceOf(CaseError);
  });

  test('search, filter, sort and reorder', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    const suite = await createSuite(ctx, { name: 'Checkout' });
    await createCase(ctx, { title: 'Pay by card', suiteId: suite.id, priority: 'high', steps: [{ action: 'Enter the IBAN' }] });
    const b = await createCase(ctx, { title: 'Apply coupon', suiteId: suite.id, priority: 'critical', tags: ['promo'] });
    await createCase(ctx, { title: 'Old flow', status: 'deprecated' });

    const ids = async (f: Parameters<typeof listCases>[1]) => (await listCases(tenant.project.id, f)).rows.map((r) => r.number);
    expect(await ids({})).toEqual([1, 2, 3]);
    expect(await ids({ suite: suite.id })).toEqual([1, 2]);
    expect(await ids({ suite: 'unassigned' })).toEqual([3]);
    expect(await ids({ q: 'iban' })).toEqual([1]);
    expect(await ids({ q: 'TC-2' })).toEqual([2]);
    expect(await ids({ q: 'promo' })).toEqual([2]);
    expect(await ids({ status: ['active'], sort: 'priority' })).toEqual([2, 1]);

    await reorderCase(ctx, b.id, 'up');
    expect(await ids({ suite: suite.id })).toEqual([2, 1]);
    expect((await listCases(tenant.project.id, { suite: suite.id })).rows[0].suitePath).toEqual(['Checkout']);
  });

  test('bulk edits add and remove tags, move, and cap the selection', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    const suite = await createSuite(ctx, { name: 'Moved' });
    const a = await createCase(ctx, { title: 'a', tags: ['old', 'keep'] });
    const b = await createCase(ctx, { title: 'b', tags: ['keep'] });
    await expect(bulkUpdate(ctx, [a.id, b.id], { addTags: ['new'], removeTags: ['OLD'], suiteId: suite.id, priority: 'low' })).resolves.toEqual({ updated: 2 });
    const rows = (await listCases(tenant.project.id, { suite: suite.id })).rows;
    expect(rows.map((r) => [r.title, r.tags, r.priority])).toEqual([
      ['a', ['keep', 'new'], 'low'],
      ['b', ['keep', 'new'], 'low'],
    ]);
    await expect(bulkUpdate(ctx, Array.from({ length: 201 }, () => a.id), { priority: 'high' })).rejects.toThrow(/200/);
    await expect(deleteCases(ctx, [a.id])).resolves.toBe(1);
  });
});

describe('links', () => {
  test('come from tags and annotations at ingest, and follow the code', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    await createCase(ctx, { title: 'Log in' });
    await createCase(ctx, { title: 'Log out', automation: 'planned' });

    await run(db, tenant, {
      tests: [
        { title: 'logs in', tags: ['@TC-1'], outcome: 'passed' },
        { title: 'logs out', annotations: [{ type: 'test-case', description: 'TC-2, TC-99' }], outcome: 'failed' },
        { title: 'unrelated', outcome: 'passed' },
      ],
    });
    let detail = await getCaseDetail(tenant.project.id, 1);
    expect(detail).toMatchObject({ automation: 'automated', verdict: 'passing', linkCount: 1 });
    expect(detail!.links[0]).toMatchObject({ title: 'logs in', source: 'code', lastOutcome: 'passed', runs: 1, passed: 1 });
    expect(await getCaseDetail(tenant.project.id, 2)).toMatchObject({ automation: 'automated', verdict: 'failing' });

    // The tag is gone from the code: the link goes, and the case needs automating again.
    await run(db, tenant, { tests: [{ title: 'logs in', outcome: 'passed' }] });
    detail = await getCaseDetail(tenant.project.id, 1);
    expect(detail).toMatchObject({ automation: 'planned', linkCount: 0, verdict: 'none' });
    expect((await listCaseVersions(tenant.project.id, 1))![0]).toMatchObject({ changed: ['automation'], author: null });
  });

  test('made by hand survive runs and demote the case when the last one goes', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    await run(db, tenant, { tests: [{ title: 'checks out', outcome: 'flaky' }] });
    const c = await createCase(ctx, { title: 'Check out' });
    const [testId] = await testIdByTitle(db, tenant, 'checks out');
    await expect(linkTests(ctx, c.id, [testId])).resolves.toEqual({ linked: 1 });
    await expect(linkTests(ctx, c.id, [testId])).resolves.toEqual({ linked: 0 });

    await run(db, tenant, { tests: [{ title: 'checks out', outcome: 'passed' }] });
    const detail = await getCaseDetail(tenant.project.id, c.number);
    expect(detail).toMatchObject({ automation: 'automated', verdict: 'flaky' });
    expect(detail!.links[0]).toMatchObject({ source: 'manual', runs: 2, flaky: 1 });

    await expect(unlinkTest(ctx, c.id, testId)).resolves.toEqual({ source: 'manual' });
    expect(await getCaseDetail(tenant.project.id, c.number)).toMatchObject({ automation: 'planned' });
  });

  test('refuse tests of another project', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await run(db, other, { tests: [{ title: 'theirs', outcome: 'passed' }] });
    const [foreign] = await testIdByTitle(db, other, 'theirs');
    const c = await createCase(ctxOf(tenant), { title: 'mine' });
    await expect(linkTests(ctxOf(tenant), c.id, [foreign])).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('adopting tests', () => {
  test('creates linked cases with steps, mirrors suites and merges browsers', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    await run(db, tenant, {
      tests: [
        { file: 'tests/checkout/cart.spec.ts', title: 'adds an item', project: 'chromium', steps: ['Open the shop', 'Add to cart'], tags: ['@smoke'], outcome: 'passed' },
        { file: 'tests/checkout/cart.spec.ts', title: 'adds an item', project: 'firefox', outcome: 'passed' },
        { file: 'tests/login.spec.ts', title: 'logs in', outcome: 'passed' },
      ],
    });
    const candidates = await listAutomatedTests(tenant.project.id, { uncovered: true });
    expect(candidates.total).toBe(3);

    const result = await adoptTests(ctx, { testIds: candidates.rows.map((r) => r.testId) });
    expect(result.created).toHaveLength(2);
    const all = (await listCases(tenant.project.id)).rows;
    expect(all.map((r) => [r.title, r.suitePath, r.automation, r.linkCount])).toEqual(
      expect.arrayContaining([
        ['adds an item', ['cart'], 'automated', 2],
        ['logs in', ['login'], 'automated', 1],
      ]),
    );
    const adds = all.find((r) => r.title === 'adds an item')!;
    const detail = await getCaseDetail(tenant.project.id, adds.number);
    expect(detail!.steps.map((s) => s.action)).toEqual(['Open the shop', 'Add to cart']);
    expect(detail!.tags).toEqual(['smoke']);

    // Nothing is left to adopt, and adopting again skips what is covered.
    expect((await listAutomatedTests(tenant.project.id, { uncovered: true })).total).toBe(0);
    await expect(adoptTests(ctx, { testIds: candidates.rows.map((r) => r.testId) })).resolves.toMatchObject({ created: [], skipped: 3 });
    const links = await db.select().from(testCaseLinks);
    expect(links).toHaveLength(3);
  });

  test('reads describe paths and file labels', () => {
    expect(fileLabel('tests/checkout/cart.spec.ts')).toBe('cart');
    expect(fileLabel('e2e/login.test.tsx')).toBe('login');
    expect(describePath(['', 'chromium', 'tests/a.spec.ts', 'Cart', 'Coupons', 'applies one'], 'tests/a.spec.ts', 'chromium')).toEqual(['Cart', 'Coupons']);
  });
});

describe('coverage', () => {
  test('counts automation, verdicts and uncovered tests, ignoring deprecated cases', async ({ db, tenant }) => {
    const ctx = ctxOf(tenant);
    await createCase(ctx, { title: 'manual' });
    await createCase(ctx, { title: 'planned', automation: 'planned' });
    await createCase(ctx, { title: 'claims automation', automation: 'automated' });
    await createCase(ctx, { title: 'gone', status: 'deprecated', automation: 'planned' });
    await createCase(ctx, { title: 'failing' });
    await run(db, tenant, {
      tests: [
        { title: 'fails', tags: ['@TC-5'], outcome: 'failed' },
        { title: 'nobody covers this', outcome: 'passed' },
      ],
    });
    const coverage = await getCoverage(tenant.project.id);
    expect(coverage).toMatchObject({
      total: 5,
      byStatus: { active: 4, draft: 0, deprecated: 1 },
      byAutomation: { manual: 1, planned: 1, automated: 2 },
      unverified: 1,
      failing: 1,
      uncoveredTests: 1,
    });
    expect((await listCases(tenant.project.id, { unverified: true })).rows.map((r) => r.title)).toEqual(['claims automation']);
    expect((await listCases(tenant.project.id, { verdict: ['failing'] })).rows.map((r) => r.title)).toEqual(['failing']);
  });
});
