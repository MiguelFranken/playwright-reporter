/**
 * Data retention: the policy superadmins save, the sweep that deletes old run
 * history (and the bytes of its artifacts, for real, on the local driver),
 * the housekeeping of expired auth rows, the triggers, the purge, and the
 * numbers Admin → Database shows.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { AttachmentRef } from '@miguelfranken/protocol';
import { purgeRunHistory, runDataSweep, updateDataRetentionPolicy } from '@/app/(app)/admin/actions';
import { GET as cronRoute } from '@/app/api/cron/data-retention/route';
import {
  DEFAULT_POLICY,
  PURGE_CONFIRMATION,
  getDataRetentionPolicy,
  purgeRunHistory as purgeAll,
  saveDataRetentionPolicy,
  sweepDataAfterIngest,
  sweepExpiredData,
  type DataRetentionPolicy,
} from '@/lib/data-retention';
import { databaseSize, duePreview, historyTotals, ingestByDay, projectFootprints } from '@/lib/data-retention/stats';
import {
  artifactSweeps,
  attachments,
  auditLogs,
  dataSweeps,
  instanceSettings,
  runEvents,
  runs,
  sessions,
  testAttempts,
  testResults,
  tests,
  verifications,
} from '@/lib/db/schema';
import { getAttachmentForProject, storeUpload } from '@/lib/ingest/service';
import { getStorage, type StorageAdapter } from '@/lib/storage';
import { attachmentRef, playRun } from './factories';
import { afterEach, createTenant, createUserRow, db, describe, expect, test, vi, type Db, type Tenant } from './fixtures';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

const policy = (p: Partial<DataRetentionPolicy> = {}): DataRetentionPolicy => ({
  ...DEFAULT_POLICY,
  enabled: true,
  runDays: 30,
  keepLatestRuns: 0,
  ...p,
});

const superadmin = () => createUserRow(db, { instanceRole: 'superadmin' });

/** A finished run that started `ageDays` ago, with two tests last seen then too. */
async function oldRun(tenant: Tenant, ageDays: number, extra: { attachments?: AttachmentRef[] } = {}) {
  const titles = [`stable ${ageDays}`, `broken ${ageDays}`];
  const played = await playRun(tenant.tokenProject, {
    startedAt: daysAgo(ageDays),
    tests: [
      { outcome: 'passed', title: titles[0] },
      { outcome: 'failed', title: titles[1], attachments: extra.attachments },
    ],
  });
  await db
    .update(tests)
    .set({ firstSeenAt: daysAgo(ageDays), lastSeenAt: daysAgo(ageDays) })
    .where(inArray(tests.title, titles));
  return played.runId;
}

/** A run whose one attachment is uploaded to the local store. */
async function runWithArtifact(tenant: Tenant, ageDays: number, bytes = 10) {
  const ref = attachmentRef({ name: 'video', contentType: 'video/webm' });
  const runId = await oldRun(tenant, ageDays, { attachments: [ref] });
  const row = await getAttachmentForProject(tenant.tokenProject, ref.id);
  await storeUpload(row, new Blob([new Uint8Array(bytes).fill(7)]).stream(), ref.contentType);
  const [stored] = await db.select().from(attachments).where(eq(attachments.id, row.id));
  return { runId, attachment: stored };
}

async function exists(root: string, key: string) {
  return access(path.join(root, key)).then(
    () => true,
    () => false,
  );
}

async function runIds(db: Db) {
  return (await db.select({ id: runs.id }).from(runs)).map((r) => r.id);
}

function wrapStorage(overrides: Partial<StorageAdapter>): StorageAdapter {
  const real = getStorage();
  return {
    name: real.name,
    retention: real.retention,
    createUpload: real.createUpload.bind(real),
    put: real.put.bind(real),
    get: real.get.bind(real),
    head: real.head.bind(real),
    delete: real.delete.bind(real),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('policy', () => {
  test('keeps everything until somebody turns it on, apart from the artifact policy', async ({ db, tenant }) => {
    expect(await getDataRetentionPolicy()).toMatchObject({ source: 'default', policy: { enabled: false } });

    vi.stubEnv('DATA_RETENTION_DAYS', '60');
    expect(await getDataRetentionPolicy()).toMatchObject({ source: 'environment', policy: { enabled: true, runDays: 60 } });

    await saveDataRetentionPolicy(policy({ enabled: false, runDays: 10 }), tenant.adminUser.id);
    expect(await getDataRetentionPolicy()).toMatchObject({ source: 'saved', policy: { enabled: false, runDays: 10 }, updatedBy: tenant.adminUser.id });
    expect((await db.select().from(instanceSettings)).map((r) => r.key)).toEqual(['dataRetention']);
  });
});

describe('updateDataRetentionPolicy (admin action)', () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    return data;
  };
  const fields = { enabled: 'on', runDays: '45', keepLatestRuns: '5', eventDays: '3', auditDays: '', housekeeping: 'on' };

  test('is for superadmins only', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await updateDataRetentionPolicy(null, form(fields))).toEqual({ ok: false, message: 'Superadmins only.' });
    expect((await getDataRetentionPolicy()).source).toBe('default');
  });

  test('saves the policy and audits the change', async ({ db, actor }) => {
    const admin = await superadmin();
    actor.signIn(admin);
    expect(await updateDataRetentionPolicy(null, form(fields))).toEqual({ ok: true, message: 'Data retention policy saved.' });
    expect((await getDataRetentionPolicy()).policy).toEqual({
      enabled: true,
      runDays: 45,
      keepLatestRuns: 5,
      eventDays: 3,
      auditDays: null,
      housekeeping: true,
    });
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'database.retention.update'));
    expect(log).toMatchObject({ actorId: admin.id, target: { from: { enabled: false }, to: { enabled: true, runDays: 45 } } });
  });

  test('refuses nonsense and keeps what was there', async ({ actor }) => {
    actor.signIn(await superadmin());
    expect(await updateDataRetentionPolicy(null, form({ ...fields, runDays: '0' }))).toMatchObject({ ok: false });
    expect((await getDataRetentionPolicy()).source).toBe('default');
  });
});

describe('sweepExpiredData', () => {
  test('does nothing while retention is off', async ({ db, tenant }) => {
    await oldRun(tenant, 400);
    expect(await sweepExpiredData({ trigger: 'cron' })).toEqual({ status: 'disabled' });
    expect(await runIds(db)).toHaveLength(1);
    expect(await db.select().from(dataSweeps)).toHaveLength(0);
  });

  test('deletes old finished runs with everything under them, and keeps the young ones', async ({ db, tenant }) => {
    await saveDataRetentionPolicy(policy({ runDays: 30 }), tenant.adminUser.id);
    const old = await oldRun(tenant, 40);
    const young = await oldRun(tenant, 5);

    const result = await sweepExpiredData({ trigger: 'cron' });
    expect(result).toMatchObject({
      status: 'done',
      deleted: { runs: 1, results: 2, attempts: 2, tests: 2 },
      hasMore: false,
      error: null,
    });
    expect(await runIds(db)).toEqual([young]);
    expect(await db.select().from(testResults).where(eq(testResults.runId, old))).toEqual([]);
    expect(await db.select().from(runEvents).where(eq(runEvents.runId, old))).toEqual([]);
    // Only the tests the old run alone knew are dropped from the catalogue.
    expect((await db.select({ title: tests.title }).from(tests)).map((t) => t.title).sort()).toEqual(['broken 5', 'stable 5']);
    expect(await db.select().from(testAttempts)).toHaveLength(2);

    const [sweep] = await db.select().from(dataSweeps);
    expect(sweep).toMatchObject({ trigger: 'cron', hasMore: false, finishedAt: expect.any(Date), deleted: expect.objectContaining({ runs: 1 }) });
    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { runs: 0 } });
  });

  test('never deletes a run that is still going', async ({ db, tenant }) => {
    await saveDataRetentionPolicy(policy({ runDays: 1 }), tenant.adminUser.id);
    await playRun(tenant.tokenProject, { startedAt: daysAgo(10), finish: false, tests: [{ outcome: 'running' }] });
    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { runs: 0 } });
    expect(await runIds(db)).toHaveLength(1);
  });

  test('keeps the newest runs of every project whatever their age', async ({ db, tenant }) => {
    await saveDataRetentionPolicy(policy({ runDays: 1, keepLatestRuns: 2 }), tenant.adminUser.id);
    const other = await createTenant(db);
    const a = [await oldRun(tenant, 50), await oldRun(tenant, 40), await oldRun(tenant, 30)];
    const b = [await oldRun(other, 50)];

    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { runs: 1 } });
    expect((await runIds(db)).sort()).toEqual([a[1], a[2], b[0]].sort());
  });

  test('deletes the bytes of the runs’ artifacts from the store', async ({ db, tenant, storage }) => {
    await saveDataRetentionPolicy(policy({ runDays: 30 }), tenant.adminUser.id);
    const gone = await runWithArtifact(tenant, 40, 1000);
    const kept = await runWithArtifact(tenant, 2);

    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { runs: 1, attachments: 1 }, artifactBytes: 1000 });
    expect(await exists(storage, gone.attachment.storageKey)).toBe(false);
    expect(await exists(storage, kept.attachment.storageKey)).toBe(true);
    expect(await db.select().from(attachments).where(eq(attachments.id, gone.attachment.id))).toEqual([]);
  });

  test('a failing store rolls the batch back, and the next sweep deletes it', async ({ db, tenant, storage }) => {
    await saveDataRetentionPolicy(policy({ runDays: 30 }), tenant.adminUser.id);
    const { runId, attachment } = await runWithArtifact(tenant, 40);
    const failing = wrapStorage({ delete: async () => Promise.reject(new Error('blob store unavailable')) });

    expect(await sweepExpiredData({ trigger: 'cron', storage: failing })).toMatchObject({
      deleted: { runs: 0 },
      hasMore: true,
      error: 'blob store unavailable',
    });
    expect(await runIds(db)).toEqual([runId]);
    expect(await exists(storage, attachment.storageKey)).toBe(true);

    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { runs: 1 }, error: null });
  });

  test('leaves runs whose live artifacts sit in another store', async ({ db, tenant }) => {
    await saveDataRetentionPolicy(policy({ runDays: 30 }), tenant.adminUser.id);
    const { runId, attachment } = await runWithArtifact(tenant, 40);
    await db.update(attachments).set({ storageDriver: 'vercel-blob' }).where(eq(attachments.id, attachment.id));
    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { runs: 0 } });

    // Once the artifact has expired there is nothing left to lose track of.
    await db.update(attachments).set({ status: 'expired', expiredAt: new Date() }).where(eq(attachments.id, attachment.id));
    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { runs: 1, attachments: 1 }, artifactBytes: 0 });
    expect(await runIds(db)).not.toContain(runId);
  });

  test('works through a backlog in batches and stops at its budget', async ({ db, tenant }) => {
    await saveDataRetentionPolicy(policy({ runDays: 1 }), tenant.adminUser.id);
    for (let i = 0; i < 5; i++) await oldRun(tenant, 10 + i);
    expect(await sweepExpiredData({ trigger: 'manual', budgetMs: 0 })).toMatchObject({ deleted: { runs: 0 }, hasMore: true });
    expect(await sweepExpiredData({ trigger: 'manual', batchSize: 2 })).toMatchObject({ deleted: { runs: 5 }, hasMore: false });
    expect(await runIds(db)).toEqual([]);
  });

  test('two sweeps at once never delete the same run twice', async ({ db, tenant }) => {
    await saveDataRetentionPolicy(policy({ runDays: 1 }), tenant.adminUser.id);
    for (let i = 0; i < 4; i++) await oldRun(tenant, 10 + i);
    const [a, b] = await Promise.all([
      sweepExpiredData({ trigger: 'cron', batchSize: 1 }),
      sweepExpiredData({ trigger: 'ingest', batchSize: 1 }),
    ]);
    const total = (a.status === 'done' ? a.deleted.runs : 0) + (b.status === 'done' ? b.deleted.runs : 0);
    expect(total).toBe(4);
    expect(await runIds(db)).toEqual([]);
  });

  test('cuts back the live event log of finished runs only', async ({ db, tenant }) => {
    await saveDataRetentionPolicy(policy({ runDays: 90, eventDays: 7 }), tenant.adminUser.id);
    const finished = await oldRun(tenant, 10);
    const { runId: going } = await playRun(tenant.tokenProject, { startedAt: daysAgo(10), finish: false, tests: [{ outcome: 'running' }] });
    const before = await db.select().from(runEvents).where(eq(runEvents.runId, finished));
    expect(before.length).toBeGreaterThan(0);

    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { runs: 0, events: before.length } });
    expect(await db.select().from(runEvents).where(eq(runEvents.runId, finished))).toEqual([]);
    expect((await db.select().from(runEvents).where(eq(runEvents.runId, going))).length).toBeGreaterThan(0);
    expect(await runIds(db)).toHaveLength(2);
  });

  test('keeps the audit log unless the policy sets a lifetime', async ({ db, tenant }) => {
    await db.insert(auditLogs).values([
      { action: 'team.create', createdAt: daysAgo(400) },
      { action: 'team.update', createdAt: daysAgo(3) },
    ]);
    await saveDataRetentionPolicy(policy({ auditDays: null }), tenant.adminUser.id);
    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { audit: 0 } });

    await saveDataRetentionPolicy(policy({ auditDays: 365 }), tenant.adminUser.id);
    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { audit: 1 } });
    expect((await db.select().from(auditLogs)).map((l) => l.action)).toEqual(['team.update']);
  });

  test('housekeeping deletes what expired more than a week ago, and old sweep logs', async ({ db, tenant }) => {
    const user = tenant.adminUser;
    await db.insert(sessions).values([
      { userId: user.id, token: `t-${randomUUID()}`, expiresAt: daysAgo(10) },
      { userId: user.id, token: `t-${randomUUID()}`, expiresAt: daysAgo(2) },
      { userId: user.id, token: `t-${randomUUID()}`, expiresAt: daysAgo(-5) },
    ]);
    await db.insert(verifications).values({ identifier: 'x', value: 'y', expiresAt: daysAgo(30) });
    await db.insert(artifactSweeps).values([
      { trigger: 'cron', storageDriver: 'local', startedAt: daysAgo(200) },
      { trigger: 'cron', storageDriver: 'local', startedAt: daysAgo(1) },
    ]);

    await saveDataRetentionPolicy(policy({ housekeeping: false }), tenant.adminUser.id);
    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { auth: 0, sweepLogs: 0 } });

    await saveDataRetentionPolicy(policy({ housekeeping: true }), tenant.adminUser.id);
    expect(await sweepExpiredData({ trigger: 'cron' })).toMatchObject({ deleted: { auth: 2, sweepLogs: 1 } });
    expect(await db.select().from(sessions)).toHaveLength(2);
    expect(await db.select().from(artifactSweeps)).toHaveLength(1);
  });
});

describe('triggers', () => {
  test('the cron endpoint is shut without CRON_SECRET and needs it exactly', async ({ db, tenant }) => {
    await saveDataRetentionPolicy(policy({ runDays: 1 }), tenant.adminUser.id);
    await oldRun(tenant, 3);
    const call = (auth?: string) =>
      cronRoute(new Request('http://test.local/api/cron/data-retention', { headers: auth ? { authorization: auth } : {} }));

    expect((await call('Bearer anything')).status).toBe(503);
    vi.stubEnv('CRON_SECRET', 'cron-secret-value');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect(await db.select().from(dataSweeps)).toHaveLength(0);

    const res = await call('Bearer cron-secret-value');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'done', deleted: { runs: 1 } });
  });

  test('a finished run sweeps at most every twelve hours, and only where allowed', async ({ db, tenant }) => {
    await saveDataRetentionPolicy(policy({ runDays: 1 }), tenant.adminUser.id);
    await oldRun(tenant, 3);
    expect(await sweepDataAfterIngest()).toEqual({ status: 'skipped' });

    vi.stubEnv('DATA_RETENTION_INGEST_SWEEP', 'on');
    expect(await sweepDataAfterIngest()).toMatchObject({ status: 'done', deleted: { runs: 1 } });
    await oldRun(tenant, 3);
    expect(await sweepDataAfterIngest()).toEqual({ status: 'skipped' });

    await db.update(dataSweeps).set({ startedAt: new Date(Date.now() - 13 * 3_600_000) });
    expect(await sweepDataAfterIngest()).toMatchObject({ status: 'done', deleted: { runs: 1 } });
    // The artifact sweep's log does not count: the two run apart.
    expect(await db.select().from(artifactSweeps)).toHaveLength(0);
  });

  test('"Run now" is for superadmins, refuses while off, and is audited', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await runDataSweep()).toEqual({ ok: false, message: 'Superadmins only.' });

    const admin = await superadmin();
    actor.signIn(admin);
    expect(await runDataSweep()).toMatchObject({ ok: false, message: expect.stringMatching(/Turn data retention on/) });

    await saveDataRetentionPolicy(policy({ runDays: 1 }), admin.id);
    await oldRun(tenant, 2);
    expect(await runDataSweep()).toMatchObject({ ok: true, deleted: { runs: 1, results: 2 }, hasMore: false });
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'database.retention.sweep'));
    expect(log).toMatchObject({ actorId: admin.id, target: { deleted: { runs: 1 } } });
  });
});

describe('purge', () => {
  test('deletes every finished run, even with retention off, and leaves the rest', async ({ db, tenant, storage }) => {
    const { attachment } = await runWithArtifact(tenant, 0, 50);
    await oldRun(tenant, 400);
    const { runId: going } = await playRun(tenant.tokenProject, { finish: false, tests: [{ outcome: 'running', title: 'in flight' }] });

    const result = await purgeAll({ batchSize: 1 });
    expect(result).toMatchObject({ status: 'done', deleted: { runs: 2, attachments: 1 }, artifactBytes: 50, hasMore: false, error: null });
    expect(await runIds(db)).toEqual([going]);
    expect(await exists(storage, attachment.storageKey)).toBe(false);
    expect((await db.select().from(dataSweeps))[0].trigger).toBe('force');
  });

  test('the action wants the phrase and a superadmin, and is audited', async ({ db, tenant, actor }) => {
    await oldRun(tenant, 1);
    actor.signIn(tenant.adminUser);
    expect(await purgeRunHistory(PURGE_CONFIRMATION)).toEqual({ ok: false, message: 'Superadmins only.' });

    const admin = await superadmin();
    actor.signIn(admin);
    expect(await purgeRunHistory('yes')).toMatchObject({ ok: false });
    expect(await runIds(db)).toHaveLength(1);

    expect(await purgeRunHistory(PURGE_CONFIRMATION)).toMatchObject({ ok: true, deleted: { runs: 1 } });
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'database.purge'));
    expect(log).toMatchObject({ actorId: admin.id });
  });
});

describe('stats', () => {
  test('sizes, ingest per day, footprints and the due preview agree with the rows', async ({ db, tenant }) => {
    await oldRun(tenant, 40);
    await runWithArtifact(tenant, 1, 300);
    await oldRun(tenant, 0);

    const size = await databaseSize();
    expect(size.totalBytes).toBeGreaterThan(0);
    const names = size.tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['runs', 'test_results', 'test_attempts', 'data_sweeps']));
    for (const t of size.tables) expect(t.totalBytes).toBeGreaterThanOrEqual(t.tableBytes + t.indexBytes);

    const days = await ingestByDay(7);
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toMatchObject({ runs: 1, results: 2, attempts: 2 });
    expect(days.at(-2)).toMatchObject({ runs: 1, results: 2, artifactBytes: 300 });
    expect(days.reduce((s, d) => s + d.runs, 0)).toBe(2);

    const totals = await historyTotals(size);
    expect(totals).toMatchObject({ runs: 3, results: 6 });
    expect(totals.oldestRunAt!.getTime()).toBeLessThan(daysAgo(39).getTime());
    expect(totals.bytesPerResult).toBeGreaterThan(0);

    const [fp] = await projectFootprints();
    expect(fp).toMatchObject({ projectId: tenant.project.id, teamSlug: tenant.team.slug, runs: 3, results: 6, liveArtifactBytes: 300 });

    // A preview, counted while the policy is off.
    const due = await duePreview(policy({ enabled: false, runDays: 30, eventDays: 7 }));
    expect(due).toMatchObject({ runs: 1, results: 2, artifactBytes: 0, audit: null, expired: 0 });
    expect(due.events).toBeGreaterThan(0);
    expect(await db.select().from(runs).where(inArray(runs.projectId, [tenant.project.id]))).toHaveLength(3);
  });
});
