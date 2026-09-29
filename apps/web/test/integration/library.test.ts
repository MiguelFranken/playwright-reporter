/**
 * The library end to end: the default branch is always there, a reference
 * follows each test's newest run on its branch or pull request or shows one
 * pinned run, one reference is the default, and retention keeps what the
 * library shows.
 */
import { eq } from 'drizzle-orm';
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { attachments, auditLogs, libraryReferences, runs } from '@/lib/db/schema';
import { defaultLibraryRef, getLibraryReference, libraryCandidates, libraryFlows, listLibraryReferences, setLibraryReference } from '@/lib/review/library';
import { runsDueWhere } from '@/lib/data-retention';
import { dueWhere } from '@/lib/storage/retention';
import { updateLibraryReference } from '@/app/(app)/teams/[team]/projects/[project]/library/actions';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from './factories';
import { createMember, describe, expect, test, type Tenant } from './fixtures';

const sha = (c: string) => c.repeat(64);

/** A run of `tests` (by title) on a branch or pull request, each capturing one checkpoint. */
async function run(tenant: Tenant, opts: { branch?: string; prNumber?: number; tests?: string[]; checkpoint?: string; hash?: string; startedAt?: Date }) {
  const startedAt = opts.startedAt ?? new Date();
  const started = await startRun(
    tenant.tokenProject,
    runStart({ startedAt: startedAt.toISOString(), git: { branch: opts.branch ?? 'main', prNumber: opts.prNumber, prTitle: opts.prNumber ? 'Checkout redesign' : undefined } }),
  );
  const r = await getRunForProject(tenant.tokenProject, started.runId);
  const events = (opts.tests ?? ['places an order']).flatMap((title, i) => {
    const key = `tests/checkout.spec.ts::${title}`;
    const image = attachmentRef({ name: `review:${opts.checkpoint ?? 'ready'}:desktop` });
    const checkpoints: Checkpoint[] = [{ name: opts.checkpoint ?? 'ready', title: 'Ready', sequence: 0, variants: [{ variant: 'desktop', attachmentId: image.id, sha256: opts.hash ?? sha('a') }] }];
    return [testBegin({ seq: i * 2, testKey: key, title, file: 'tests/checkout.spec.ts' }), attemptEnd({ seq: i * 2 + 1, testKey: key, startedAt: startedAt.toISOString(), attachments: [image], checkpoints })];
  });
  await ingestEvents(tenant.tokenProject, r, eventBatch(events));
  return { id: r.id, number: started.runNumber };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const main = { kind: 'branch', branch: 'main' } as const;
const pr = { kind: 'pull_request', prNumber: 212 } as const;

describe('references', () => {
  test('the default branch is always listed and is the default until another is chosen', async ({ tenant }) => {
    await run(tenant, {});
    const refs = await listLibraryReferences(tenant.project.id, 'main');
    expect(refs).toMatchObject([{ key: main, kept: false, isDefault: true }]);
    expect(await defaultLibraryRef(tenant.project.id, 'main')).toEqual(main);

    await run(tenant, { branch: 'feat/checkout', prNumber: 212 });
    await setLibraryReference({ projectId: tenant.project.id, key: pr, patch: { keep: true, isDefault: true, title: '  New checkout ' }, userId: null });
    expect(await defaultLibraryRef(tenant.project.id, 'main')).toEqual(pr);
    const after = await listLibraryReferences(tenant.project.id, 'main');
    expect(after.map((r) => [r.key.kind, r.isDefault, r.kept])).toEqual([
      ['pull_request', true, true],
      ['branch', false, false],
    ]);
    expect(after[0]).toMatchObject({ title: 'New checkout', prTitle: 'Checkout redesign', headBranch: 'feat/checkout', latestCounts: { new: 1 } });

    // A second default replaces the first.
    await setLibraryReference({ projectId: tenant.project.id, key: main, patch: { isDefault: true }, userId: null });
    expect(await defaultLibraryRef(tenant.project.id, 'main')).toEqual(main);
    expect((await getLibraryReference(tenant.project.id, pr, 'main')).isDefault).toBe(false);

    // Dropping the default hands it back to the default branch.
    await setLibraryReference({ projectId: tenant.project.id, key: main, patch: { keep: false }, userId: null });
    expect(await defaultLibraryRef(tenant.project.id, 'main')).toEqual(main);
    expect((await listLibraryReferences(tenant.project.id, 'main')).find((r) => r.key.kind === 'branch')).toMatchObject({ kept: false, isDefault: true });
  });

  test('offers the branches and pull requests that captured checkpoints', async ({ tenant }) => {
    await run(tenant, { branch: 'feat/checkout', prNumber: 212 });
    await run(tenant, {});
    const candidates = await libraryCandidates(tenant.project.id);
    expect(candidates.branches.sort()).toEqual(['feat/checkout', 'main']);
    expect(candidates.pullRequests).toEqual([{ number: 212, title: 'Checkout redesign' }]);
  });
});

describe('flows', () => {
  test('follows each test’s newest run on the reference, and a pin shows exactly one run', async ({ tenant }) => {
    const both = await run(tenant, { tests: ['places an order', 'applies a coupon'], startedAt: minutesAgo(30) });
    const onlyOne = await run(tenant, { tests: ['places an order'], checkpoint: 'renamed', startedAt: minutesAgo(10) });
    await run(tenant, { branch: 'other', tests: ['places an order'], checkpoint: 'elsewhere' });

    const following = await libraryFlows(tenant.project.id, main);
    const byTitle = Object.fromEntries(following.map((f) => [f.title, { run: f.runNumber, checkpoints: f.checkpoints.map((c) => c.name) }]));
    // A partial run does not hide the test it skipped; a renamed checkpoint replaces the old one.
    expect(byTitle).toEqual({
      'places an order': { run: onlyOne.number, checkpoints: ['renamed'] },
      'applies a coupon': { run: both.number, checkpoints: ['ready'] },
    });

    await setLibraryReference({ projectId: tenant.project.id, key: main, patch: { pin: both.number }, userId: null });
    const pinned = await libraryFlows(tenant.project.id, main);
    expect(pinned.map((f) => [f.title, f.runNumber, f.checkpoints[0].name]).sort()).toEqual([
      ['applies a coupon', both.number, 'ready'],
      ['places an order', both.number, 'ready'],
    ]);
    expect((await getLibraryReference(tenant.project.id, main, 'main')).pinnedRun?.number).toBe(both.number);

    await setLibraryReference({ projectId: tenant.project.id, key: main, patch: { pin: 'latest' }, userId: null });
    expect((await libraryFlows(tenant.project.id, main)).find((f) => f.title === 'places an order')?.runNumber).toBe(onlyOne.number);
  });

  test('only pins a run of the reference that captured checkpoints', async ({ tenant }) => {
    const other = await run(tenant, { branch: 'other' });
    await expect(setLibraryReference({ projectId: tenant.project.id, key: main, patch: { pin: other.number }, userId: null })).rejects.toThrow('not a run of branch main');
    await expect(setLibraryReference({ projectId: tenant.project.id, key: main, patch: { pin: 99_999 }, userId: null })).rejects.toThrow('not a run of');
  });

  test('a pull request shows its own runs', async ({ tenant }) => {
    await run(tenant, {});
    const own = await run(tenant, { branch: 'feat/checkout', prNumber: 212, checkpoint: 'redesigned' });
    const flows = await libraryFlows(tenant.project.id, pr);
    expect(flows.map((f) => [f.runNumber, f.checkpoints[0].name])).toEqual([[own.number, 'redesigned']]);
  });
});

describe('retention', () => {
  test('keeps what the library shows, and never deletes a pinned run', async ({ db, tenant }) => {
    const old = await run(tenant, { startedAt: minutesAgo(60), hash: sha('a') });
    const newer = await run(tenant, { startedAt: minutesAgo(30), hash: sha('b') });
    await db.update(attachments).set({ status: 'uploaded' });
    const policy = { enabled: true, days: 1, overrides: {} };
    const later = new Date(Date.now() + 2 * 86_400_000);
    const due = async () => (await db.select({ runId: attachments.runId }).from(attachments).where(dueWhere(policy, later))).map((a) => a.runId);

    // Nobody kept main: its images age out like any other.
    expect((await due()).sort()).toEqual([old.id, newer.id].sort());

    // Kept, following: the newest capture stays.
    await setLibraryReference({ projectId: tenant.project.id, key: main, patch: { keep: true }, userId: null });
    expect(await due()).toEqual([old.id]);

    // Pinned to the old run: that one stays instead, and its run is not deleted.
    await setLibraryReference({ projectId: tenant.project.id, key: main, patch: { pin: old.number }, userId: null });
    expect(await due()).toEqual([newer.id]);
    const dataPolicy = { enabled: true, runDays: 1, keepLatestRuns: 0, eventDays: 1, auditDays: null, housekeeping: false };
    const deletable = await db.select({ id: runs.id }).from(runs).where(runsDueWhere(dataPolicy, 'local', later));
    expect(deletable.map((r) => r.id)).not.toContain(old.id);
  });
});

describe('action', () => {
  test('members keep and pin, viewers cannot, and every change is audited', async ({ db, tenant, actor }) => {
    const r = await run(tenant, { branch: 'feat/checkout', prNumber: 212 });
    const ref = { team: tenant.team.slug, project: tenant.project.slug };

    actor.signIn(tenant.adminUser);
    expect(await updateLibraryReference(ref, 'pr:212', { keep: true, pin: r.number })).toEqual({ ok: true, kept: true });
    const [row] = await db.select().from(libraryReferences);
    expect(row).toMatchObject({ kind: 'pull_request', prNumber: 212, createdBy: tenant.adminUser.id, pinnedRunId: r.id });
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'library.update'))).toHaveLength(1);

    expect(await updateLibraryReference(ref, 'nonsense', { keep: true })).toMatchObject({ ok: false });
    expect(await updateLibraryReference(ref, 'pr:212', { pin: -1 })).toMatchObject({ ok: false });
    expect(await updateLibraryReference(ref, 'pr:212', { pin: 99_999 })).toMatchObject({ ok: false, message: expect.stringContaining('not a run of pull request #212') });

    actor.signIn(await createMember(db, tenant.team.id, 'viewer'));
    expect(await updateLibraryReference(ref, 'pr:212', { keep: false })).toMatchObject({ ok: false });
    expect(await db.select().from(libraryReferences)).toHaveLength(1);
  });
});
