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

type Shot = { name: string; variants: Record<string, string> };

/** A run where each test captures the checkpoints given, and passes unless `failed`. */
async function capture(tenant: Tenant, opts: { branch?: string; startedAt: Date; tests: Record<string, { shots: Shot[]; failed?: boolean }> }) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: opts.startedAt.toISOString(), git: { branch: opts.branch ?? 'main' } }));
  const r = await getRunForProject(tenant.tokenProject, started.runId);
  const events = Object.entries(opts.tests).flatMap(([title, t], i) => {
    const key = `tests/checkout.spec.ts::${title}`;
    const images = t.shots.flatMap((shot) => Object.keys(shot.variants).map((variant) => ({ shot, variant, ref: attachmentRef({ name: `review:${shot.name}:${variant}` }) })));
    const checkpoints: Checkpoint[] = t.shots.map((shot, sequence) => ({
      name: shot.name,
      sequence,
      variants: images.filter((im) => im.shot === shot).map((im) => ({ variant: im.variant, attachmentId: im.ref.id, sha256: sha(shot.variants[im.variant]) })),
    }));
    return [
      testBegin({ seq: i * 2, testKey: key, title, file: 'tests/checkout.spec.ts' }),
      attemptEnd({ seq: i * 2 + 1, testKey: key, startedAt: opts.startedAt.toISOString(), attachments: images.map((im) => im.ref), checkpoints, ...(t.failed ? { status: 'failed', outcome: 'unexpected' } : {}) }),
    ];
  });
  await ingestEvents(tenant.tokenProject, r, eventBatch(events));
  return { id: r.id, number: started.runNumber };
}

/** What the library shows: per test, each checkpoint's variants with the run they come from and whether they changed since the capture before. */
async function shown(tenant: Tenant) {
  const flows = await libraryFlows(tenant.project.id, main);
  return Object.fromEntries(
    flows.map((f) => [
      f.title,
      f.checkpoints.map((c) => ({
        name: c.name,
        from: Object.fromEntries(c.captures.map((cap) => [cap.variant, cap.runNumber])),
        updated: Object.fromEntries(c.captures.map((cap) => [cap.variant, cap.previous ? cap.previous.capture.sha256 !== cap.sha256 : null])),
      })),
    ]),
  );
}

describe('a complete reference across full and partial runs', () => {
  const checkout = (hash: string): Shot[] => [
    { name: 'cart', variants: { desktop: hash, mobile: hash } },
    { name: 'payment', variants: { desktop: hash, mobile: hash } },
    { name: 'done', variants: { desktop: hash, mobile: hash } },
  ];

  test('a partial run updates only what it captured', async ({ tenant }) => {
    const full = await capture(tenant, { startedAt: minutesAgo(60), tests: { checkout: { shots: checkout('a') }, 'sign in': { shots: [{ name: 'form', variants: { desktop: 'c' } }] } } });
    // Only the checkout test, and only its desktop screens.
    const partial = await capture(tenant, {
      startedAt: minutesAgo(30),
      tests: { checkout: { shots: checkout('b').map((s) => ({ ...s, variants: { desktop: s.variants.desktop } })) } },
    });
    const view = await shown(tenant);
    expect(view.checkout).toEqual([
      { name: 'cart', from: { desktop: partial.number, mobile: full.number }, updated: { desktop: true, mobile: null } },
      { name: 'payment', from: { desktop: partial.number, mobile: full.number }, updated: { desktop: true, mobile: null } },
      { name: 'done', from: { desktop: partial.number, mobile: full.number }, updated: { desktop: true, mobile: null } },
    ]);
    // The test the partial run skipped keeps its screens.
    expect(view['sign in']).toEqual([{ name: 'form', from: { desktop: full.number }, updated: { desktop: null } }]);
  });

  test('a test that failed half way keeps the screens after the failure, in their place', async ({ tenant }) => {
    const full = await capture(tenant, { startedAt: minutesAgo(60), tests: { checkout: { shots: checkout('a') } } });
    const failed = await capture(tenant, { startedAt: minutesAgo(30), tests: { checkout: { shots: [checkout('b')[0]], failed: true } } });
    const view = await shown(tenant);
    expect(view.checkout.map((c) => [c.name, c.from.desktop])).toEqual([
      ['cart', failed.number],
      ['payment', full.number],
      ['done', full.number],
    ]);
    const [flow] = await libraryFlows(tenant.project.id, main);
    // The flow is the newest result's; the older checkpoints say where they come from.
    expect(flow.runNumber).toBe(failed.number);
    expect(Object.values(flow.origins ?? {}).map((o) => o.runNumber)).toEqual([full.number]);
  });

  test('the same pixels captured again are not an update', async ({ tenant }) => {
    await capture(tenant, { startedAt: minutesAgo(60), tests: { checkout: { shots: checkout('a') } } });
    const again = await capture(tenant, { startedAt: minutesAgo(30), tests: { checkout: { shots: checkout('a') } } });
    const view = await shown(tenant);
    expect(view.checkout.every((c) => c.from.desktop === again.number && c.updated.desktop === false && c.updated.mobile === false)).toBe(true);
  });

  test('a checkpoint drops out once a passing run no longer takes it, not when a run fails before it', async ({ tenant }) => {
    await capture(tenant, { startedAt: minutesAgo(90), tests: { checkout: { shots: checkout('a') } } });
    // Failing before `payment` and `done` removes nothing.
    await capture(tenant, { startedAt: minutesAgo(60), tests: { checkout: { shots: [checkout('b')[0]], failed: true } } });
    expect((await shown(tenant)).checkout.map((c) => c.name)).toEqual(['cart', 'payment', 'done']);
    // Passing without `payment`: the test no longer takes it.
    await capture(tenant, { startedAt: minutesAgo(30), tests: { checkout: { shots: [checkout('c')[0], checkout('c')[2]] } } });
    expect((await shown(tenant)).checkout.map((c) => c.name)).toEqual(['cart', 'done']);
  });

  test('another branch’s runs change nothing', async ({ tenant }) => {
    const full = await capture(tenant, { startedAt: minutesAgo(60), tests: { checkout: { shots: checkout('a') } } });
    await capture(tenant, { branch: 'feat/x', startedAt: minutesAgo(30), tests: { checkout: { shots: [checkout('b')[0]] } } });
    const view = await shown(tenant);
    expect(view.checkout.map((c) => [c.name, c.from.desktop])).toEqual([
      ['cart', full.number],
      ['payment', full.number],
      ['done', full.number],
    ]);
  });
});

describe('retention', () => {
  test('keeps what the library shows, and never deletes a pinned run', async ({ db, tenant }) => {
    const old = await run(tenant, { startedAt: minutesAgo(60), hash: sha('a') });
    const newer = await run(tenant, { startedAt: minutesAgo(30), hash: sha('b') });
    await db.update(attachments).set({ status: 'uploaded' });
    const policy = { enabled: true, days: 1, overrides: {}, keepVisuals: true };
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
    // Unless the policy lets visuals expire: then the library keeps nothing.
    const expiring = async () => (await db.select({ runId: attachments.runId }).from(attachments).where(dueWhere({ ...policy, keepVisuals: false }, later))).map((a) => a.runId);
    expect((await expiring()).sort()).toEqual([old.id, newer.id].sort());
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
