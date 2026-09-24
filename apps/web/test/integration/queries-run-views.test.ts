/**
 * 8.5 — the read models behind the run pages, over data produced by the real
 * ingest path. Nothing here inserts rows by hand: if `playRun` can't produce a
 * shape, the app can't either.
 */
import { eq } from 'drizzle-orm';
import {
  getResultDetail,
  listBranches,
  listEnvironments,
  listRunErrorGroups,
  listRunResults,
  listRunSpecs,
  listRuns,
  listTestTags,
  testHistory,
} from '@/lib/db/queries/runs';
import { attachments, testResults, tests } from '@/lib/db/schema';
import { attachmentRef, playRun } from './factories';
import { describe, expect, test, type Db, type Tenant } from './fixtures';

const HOME = 'tests/home.spec.ts';
const CART = 'tests/cart.spec.ts';

describe('listRuns', () => {
  test('returns runs newest first with their outcome counts', async ({ tenant }) => {
    await playRun(tenant.tokenProject, {
      ciRunId: 'a',
      startedAt: new Date(Date.now() - 60_000),
      tests: [
        { outcome: 'passed', title: 'one' },
        { outcome: 'failed', title: 'two' },
        { outcome: 'flaky', title: 'three' },
        { outcome: 'skipped', title: 'four' },
        { outcome: 'timedout', title: 'five' },
      ],
    });
    await playRun(tenant.tokenProject, { ciRunId: 'b', tests: [{ outcome: 'passed', title: 'one' }] });

    const { rows, total, hasMore } = await listRuns(tenant.project.id);
    expect(total).toBe(2);
    expect(hasMore).toBe(false);
    expect(rows.map((r) => r.number)).toEqual([2, 1]);
    // `failed` folds timedout in; flaky and skipped stay their own bucket.
    expect(rows[1].counts).toEqual({ total: 5, passed: 1, failed: 2, flaky: 1, skipped: 1, interrupted: 0, running: 0 });
    expect(rows[0].counts.passed).toBe(1);
  });

  test('paginates with hasMore and a stable total', async ({ tenant }) => {
    for (let i = 0; i < 4; i++) {
      await playRun(tenant.tokenProject, { ciRunId: `run-${i}`, startedAt: new Date(Date.now() - (4 - i) * 60_000), tests: [{ outcome: 'passed' }] });
    }

    const first = await listRuns(tenant.project.id, { pageSize: 2, page: 1 });
    expect(first.rows.map((r) => r.number)).toEqual([4, 3]);
    expect({ hasMore: first.hasMore, total: first.total }).toEqual({ hasMore: true, total: 4 });

    const second = await listRuns(tenant.project.id, { pageSize: 2, page: 2 });
    expect(second.rows.map((r) => r.number)).toEqual([2, 1]);
    expect({ hasMore: second.hasMore, total: second.total }).toEqual({ hasMore: false, total: 4 });
  });

  test('filters by status, branch and environment', async ({ tenant }) => {
    await playRun(tenant.tokenProject, { ciRunId: 'main-pass', branch: 'main', environment: 'staging', tests: [{ outcome: 'passed' }] });
    await playRun(tenant.tokenProject, { ciRunId: 'feat-fail', branch: 'feature/x', environment: 'preview', tests: [{ outcome: 'failed' }] });

    expect((await listRuns(tenant.project.id, { status: 'failed' })).rows.map((r) => r.ciRunId)).toEqual(['feat-fail']);
    expect((await listRuns(tenant.project.id, { status: 'all' })).total).toBe(2);
    expect((await listRuns(tenant.project.id, { branch: 'main' })).rows.map((r) => r.ciRunId)).toEqual(['main-pass']);
    expect((await listRuns(tenant.project.id, { environment: 'preview' })).rows.map((r) => r.ciRunId)).toEqual(['feat-fail']);
  });

  test.for([
    { name: 'a #number', q: '#2' },
    { name: 'a bare number', q: '2' },
    { name: 'a short sha prefix', q: 'dead' },
    { name: 'part of the commit message', q: 'checkout' },
    { name: 'part of the branch name', q: 'feature/' },
  ])('search matches $name', async ({ q }, { tenant }) => {
    await playRun(tenant.tokenProject, {
      ciRunId: 'one',
      startedAt: new Date(Date.now() - 60_000),
      branch: 'main',
      message: 'Initial import',
      shortSha: 'aaa1111',
      tests: [{ outcome: 'passed' }],
    });
    await playRun(tenant.tokenProject, {
      ciRunId: 'two',
      branch: 'feature/checkout',
      message: 'Fix the checkout flow',
      shortSha: 'deadbee',
      tests: [{ outcome: 'passed' }],
    });

    const { rows } = await listRuns(tenant.project.id, { q });
    expect(rows.map((r) => r.ciRunId)).toEqual(['two']);
  });

  test('scopes everything to one project', async ({ db, tenant }) => {
    const { createTenant } = await import('./fixtures');
    const other = await createTenant(db);
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    await playRun(other.tokenProject, { tests: [{ outcome: 'failed' }] });

    expect((await listRuns(tenant.project.id)).total).toBe(1);
    expect((await listRuns(other.project.id)).total).toBe(1);
  });
});

describe('listRunResults', () => {
  async function seed(tenant: Tenant) {
    return playRun(tenant.tokenProject, {
      tests: [
        { outcome: 'passed', file: HOME, title: 'zzz last alphabetically' },
        { outcome: 'failed', file: CART, title: 'checkout fails', error: 'Error: cart is empty' },
        { outcome: 'flaky', file: HOME, title: 'flakes' },
        { outcome: 'running', file: HOME, title: 'still going' },
        { outcome: 'interrupted', file: CART, title: 'cut off' },
        { outcome: 'skipped', file: HOME, title: 'skipped' },
      ],
      finish: false,
    });
  }

  test('orders failures first and passes last, then by file and title', async ({ tenant }) => {
    const { runId } = await seed(tenant);
    const rows = await listRunResults(runId);
    expect(rows.map((r) => r.outcome)).toEqual(['failed', 'interrupted', 'flaky', 'running', 'passed', 'skipped']);
    expect(rows[0]).toMatchObject({ file: CART, title: 'checkout fails', errorMessage: 'Error: cart is empty' });
    expect(rows[0].errorSignature).not.toBeNull();
  });

  test('outcome=failed folds in timedout and interrupted', async ({ tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, {
      tests: [
        { outcome: 'failed', title: 'a' },
        { outcome: 'timedout', title: 'b' },
        { outcome: 'interrupted', title: 'c' },
        { outcome: 'passed', title: 'd' },
      ],
    });
    const rows = await listRunResults(runId, { outcome: 'failed' });
    expect(rows.map((r) => r.title).sort()).toEqual(['a', 'b', 'c']);
    expect((await listRunResults(runId, { outcome: 'passed' })).map((r) => r.title)).toEqual(['d']);
    expect(await listRunResults(runId, { outcome: 'all' })).toHaveLength(4);
  });

  test('filters by file, free text and error signature', async ({ tenant }) => {
    const { runId } = await seed(tenant);
    expect((await listRunResults(runId, { file: CART })).map((r) => r.title).sort()).toEqual(['checkout fails', 'cut off']);
    expect((await listRunResults(runId, { q: 'flak' })).map((r) => r.title)).toEqual(['flakes']);

    const [failed] = await listRunResults(runId, { outcome: 'failed' });
    const bySignature = await listRunResults(runId, { signature: failed.errorSignature! });
    expect(bySignature.map((r) => r.id)).toEqual([failed.id]);
  });

  test('history carries the previous outcomes of the same test, newest first', async ({ tenant }) => {
    const base = Date.now() - 5 * 60_000;
    const outcomes = ['passed', 'failed', 'flaky'] as const;
    let last = '';
    for (const [i, outcome] of outcomes.entries()) {
      const played = await playRun(tenant.tokenProject, {
        ciRunId: `run-${i}`,
        startedAt: new Date(base + i * 60_000),
        tests: [{ outcome, title: 'the one test' }],
      });
      last = played.runId;
    }
    const newest = await playRun(tenant.tokenProject, {
      ciRunId: 'run-newest',
      startedAt: new Date(base + 4 * 60_000),
      tests: [{ outcome: 'passed', title: 'the one test' }],
    });
    expect(last).not.toBe(newest.runId);

    const [row] = await listRunResults(newest.runId);
    // Only older runs, newest first — the current result is not its own history.
    expect(row.history).toEqual(['flaky', 'failed', 'passed']);

    // The oldest run has nothing before it.
    const first = await listRunResults((await listRuns(tenant.project.id)).rows.at(-1)!.id);
    expect(first[0].history).toEqual([]);
  });

  test('history is capped at ten entries', async ({ tenant }) => {
    const base = Date.now() - 20 * 60_000;
    for (let i = 0; i < 12; i++) {
      await playRun(tenant.tokenProject, {
        ciRunId: `run-${i}`,
        startedAt: new Date(base + i * 60_000),
        tests: [{ outcome: 'passed', title: 'the one test' }],
      });
    }
    const newest = (await listRuns(tenant.project.id)).rows[0];
    const [row] = await listRunResults(newest.id);
    expect(row.history).toHaveLength(10);
  });

  test('attachmentKinds lists only attachments that finished uploading', async ({ db, tenant }) => {
    const shot = attachmentRef({ name: 'screenshot.png', contentType: 'image/png' });
    const video = attachmentRef({ name: 'video', contentType: 'video/webm' });
    const { runId } = await playRun(tenant.tokenProject, {
      tests: [{ outcome: 'failed', title: 'with artifacts', attachments: [shot, video] }],
    });

    expect((await listRunResults(runId))[0].attachmentKinds).toEqual([]);

    await db.update(attachments).set({ status: 'uploaded' }).where(eq(attachments.id, shot.id));
    expect((await listRunResults(runId))[0].attachmentKinds).toEqual(['screenshot']);

    await db.update(attachments).set({ status: 'uploaded' }).where(eq(attachments.id, video.id));
    expect([...(await listRunResults(runId))[0].attachmentKinds].sort()).toEqual(['screenshot', 'video']);
  });
});

describe('listRunSpecs', () => {
  test('aggregates per file', async ({ tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, {
      tests: [
        { outcome: 'passed', file: HOME, title: 'a', durationMs: 100 },
        { outcome: 'flaky', file: HOME, title: 'b', durationMs: 200 },
        { outcome: 'failed', file: CART, title: 'c', durationMs: 300 },
        { outcome: 'timedout', file: CART, title: 'd', durationMs: 400 },
        { outcome: 'skipped', file: CART, title: 'e', durationMs: 0 },
      ],
    });

    const specs = await listRunSpecs(runId);
    expect(specs.map((s) => s.file)).toEqual([CART, HOME]);
    expect(specs[0]).toMatchObject({ total: 3, failed: 2, skipped: 1, passed: 0, flaky: 0, running: 0, durationMs: 700 });
    // A flaky test ran twice, so its duration is the sum of both attempts.
    expect(specs[1]).toMatchObject({ total: 2, passed: 1, flaky: 1, durationMs: 500 });
  });
});

describe('listRunErrorGroups', () => {
  test('groups the same failure across files and points at a sample', async ({ tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, {
      tests: [
        { outcome: 'failed', file: HOME, title: 'a', error: 'Timeout 5000ms exceeded waiting for locator("#x")' },
        { outcome: 'failed', file: CART, title: 'b', error: 'Timeout 9000ms exceeded waiting for locator("#y")' },
        { outcome: 'failed', file: CART, title: 'c', error: 'Something else entirely' },
        { outcome: 'passed', file: HOME, title: 'd' },
      ],
    });

    const groups = await listRunErrorGroups(runId);
    expect(groups).toHaveLength(2);
    // Volatile parts are normalized away, so both timeouts share a signature.
    expect(groups[0].count).toBe(2);
    expect([...groups[0].files].sort()).toEqual([CART, HOME]);
    expect(groups[0].failed).toBe(2);
    expect(groups[0].sampleResultId).toMatch(/^[0-9a-f-]{36}$/);
    expect(groups[1]).toMatchObject({ count: 1, message: 'Something else entirely' });
  });

  test('ignores results without an error signature', async ({ tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }, { outcome: 'skipped', title: 'x' }] });
    expect(await listRunErrorGroups(runId)).toEqual([]);
  });
});

describe('getResultDetail', () => {
  test('returns attempts with their attachments and a position in the table order', async ({ db, tenant }) => {
    const shot = attachmentRef({ name: 'screenshot.png', contentType: 'image/png' });
    const { runId, runNumber } = await playRun(tenant.tokenProject, {
      tests: [
        { outcome: 'failed', file: CART, title: 'first in order', error: 'boom' },
        { outcome: 'flaky', file: HOME, title: 'second in order', attachments: [shot] },
        { outcome: 'passed', file: HOME, title: 'third in order' },
      ],
    });
    const ordered = await listRunResults(runId);
    expect(ordered.map((r) => r.title)).toEqual(['first in order', 'second in order', 'third in order']);

    const detail = await getResultDetail(tenant.project.id, runNumber, ordered[1].id);
    expect(detail).not.toBeNull();
    expect(detail!.test.title).toBe('second in order');
    expect(detail!.result.outcome).toBe('flaky');
    expect(detail!.attempts.map((a) => a.retry)).toEqual([0, 1]);
    expect(detail!.attempts[0].attachments).toEqual([]);
    expect(detail!.attempts[1].attachments.map((a) => a.id)).toEqual([shot.id]);
    expect(detail!.position).toEqual({
      index: 1,
      total: 3,
      prevId: ordered[0].id,
      nextId: ordered[2].id,
    });

    const first = await getResultDetail(tenant.project.id, runNumber, ordered[0].id);
    expect(first!.position).toMatchObject({ index: 0, prevId: null, nextId: ordered[1].id });
    const last = await getResultDetail(tenant.project.id, runNumber, ordered[2].id);
    expect(last!.position).toMatchObject({ index: 2, nextId: null });

    // The attachment row really belongs to the second attempt.
    const [row] = await db.select().from(attachments);
    expect(row.attemptId).toBe(detail!.attempts[1].id);
  });

  test('is scoped to the project and the run number', async ({ db, tenant }) => {
    const { createTenant } = await import('./fixtures');
    const other = await createTenant(db);
    const { runId, runNumber } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    const [result] = await listRunResults(runId);

    expect(await getResultDetail(other.project.id, runNumber, result.id)).toBeNull();
    expect(await getResultDetail(tenant.project.id, runNumber + 1, result.id)).toBeNull();
    expect(await getResultDetail(tenant.project.id, runNumber, result.id)).not.toBeNull();
  });
});

describe('facet lists', () => {
  test('collect the distinct branches, environments and tags of a project', async ({ db, tenant }) => {
    await playRun(tenant.tokenProject, { ciRunId: 'a', branch: 'main', environment: 'staging', tests: [{ outcome: 'passed', tags: ['@smoke'] }] });
    await playRun(tenant.tokenProject, { ciRunId: 'b', branch: 'main', environment: 'prod', tests: [{ outcome: 'passed', title: 'x', tags: ['@slow'] }] });
    await playRun(tenant.tokenProject, { ciRunId: 'c', branch: 'release', environment: 'prod', tests: [{ outcome: 'passed', title: 'y' }] });

    expect(await listBranches(tenant.project.id)).toEqual(['main', 'release']);
    expect(await listEnvironments(tenant.project.id)).toEqual(['prod', 'staging']);
    expect(await listTestTags(tenant.project.id)).toEqual(['@slow', '@smoke']);

    // A different project sees none of it.
    const { createTenant } = await import('./fixtures');
    const other = await createTenant(db);
    expect(await listBranches(other.project.id)).toEqual([]);
  });
});

describe('testHistory', () => {
  test('returns finished results newest first and can be scoped to a branch', async ({ db, tenant }) => {
    const base = Date.now() - 5 * 60_000;
    await playRun(tenant.tokenProject, { ciRunId: 'a', branch: 'main', startedAt: new Date(base), tests: [{ outcome: 'passed', title: 't' }] });
    await playRun(tenant.tokenProject, {
      ciRunId: 'b',
      branch: 'feature',
      startedAt: new Date(base + 60_000),
      tests: [{ outcome: 'failed', title: 't' }],
    });
    await playRun(tenant.tokenProject, {
      ciRunId: 'c',
      branch: 'main',
      startedAt: new Date(base + 120_000),
      tests: [{ outcome: 'running', title: 't' }],
      finish: false,
    });

    const [test] = await db.select().from(tests).where(eq(tests.projectId, tenant.project.id));
    const all = await testHistory(test.id);
    // The still-running result is excluded.
    expect(all.map((h) => h.outcome)).toEqual(['failed', 'passed']);
    expect(all[0]).toMatchObject({ branch: 'feature', runNumber: 2, executor: 'ci' });

    const onMain = await testHistory(test.id, { branch: 'main' });
    expect(onMain.map((h) => h.outcome)).toEqual(['passed']);
    expect(await testHistory(test.id, { limit: 1 })).toHaveLength(1);
  });
});

describe('result rows', () => {
  test('one result per (run, test)', async ({ db, tenant }: { db: Db; tenant: Tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }, { outcome: 'passed', title: 'other' }] });
    const rows = await db.select().from(testResults).where(eq(testResults.runId, runId));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.testId)).size).toBe(2);
  });
});
