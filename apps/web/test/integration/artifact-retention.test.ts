/**
 * Artifact retention: the policy superadmins save, the sweep that deletes
 * expired bytes from storage (for real, on the local driver) and marks the
 * rows, its three triggers, and what an old run's artifact link does once the
 * bytes are gone.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { AttachmentRef } from '@miguelfranken/protocol';
import { runRetentionSweep, updateRetentionPolicy } from '@/app/(app)/admin/actions';
import { GET as artifactRoute } from '@/app/api/artifacts/[attachmentId]/route';
import { GET as cronRoute } from '@/app/api/cron/artifact-retention/route';
import { artifactSweeps, attachments, auditLogs, instanceSettings, type Attachment } from '@/lib/db/schema';
import { getAttachmentForProject, storeUpload } from '@/lib/ingest/service';
import { getStorage, type StorageAdapter } from '@/lib/storage';
import {
  getRetentionPolicy,
  markMissingExpired,
  retentionStats,
  saveRetentionPolicy,
  sweepAfterIngest,
  sweepExpiredArtifacts,
  type RetentionPolicy,
} from '@/lib/storage/retention';
import { attachmentRef, playRun } from './factories';
import { afterEach, createUserRow, db, describe, expect, test, vi, type Db, type Tenant } from './fixtures';

const DAY = 86_400_000;

const REFS = {
  screenshot: () => attachmentRef({ name: 'screenshot', contentType: 'image/png' }),
  video: () => attachmentRef({ name: 'video', contentType: 'video/webm' }),
  trace: () => attachmentRef({ name: 'trace', contentType: 'application/zip' }),
};

/** A failed run whose attachments are uploaded to the local store and backdated by `ageDays`. */
async function uploadedArtifacts(db: Db, tenant: Tenant, specs: { kind: keyof typeof REFS; ageDays: number; bytes?: number }[]) {
  const refs: AttachmentRef[] = specs.map((s) => REFS[s.kind]());
  await playRun(tenant.tokenProject, { tests: [{ outcome: 'failed', attachments: refs }] });
  const rows: Attachment[] = [];
  for (const [i, ref] of refs.entries()) {
    const row = await getAttachmentForProject(tenant.tokenProject, ref.id);
    await storeUpload(row, new Blob([new Uint8Array(specs[i].bytes ?? 10).fill(7)]).stream(), ref.contentType);
    const [aged] = await db
      .update(attachments)
      .set({ createdAt: new Date(Date.now() - specs[i].ageDays * DAY) })
      .where(eq(attachments.id, row.id))
      .returning();
    rows.push(aged);
  }
  return rows;
}

async function stored(root: string, key: string) {
  return access(path.join(root, key)).then(
    () => true,
    () => false,
  );
}

async function rowsById(db: Db, ids: string[]) {
  const rows = await db.select().from(attachments).where(inArray(attachments.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

const policy = (p: Partial<RetentionPolicy> = {}): RetentionPolicy => ({ enabled: true, days: 30, overrides: {}, ...p });

const superadmin = () => createUserRow(db, { instanceRole: 'superadmin' });

/** Wraps the real local adapter, e.g. to fail deletes or to pretend the store owns lifetimes. */
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
  test('keeps everything until somebody turns it on', async ({ db }) => {
    void db;
    expect(await getRetentionPolicy()).toMatchObject({ source: 'default', policy: { enabled: false } });
  });

  test('ARTIFACT_RETENTION_DAYS sets the default, a saved policy wins over it', async ({ db, tenant }) => {
    vi.stubEnv('ARTIFACT_RETENTION_DAYS', '14');
    expect(await getRetentionPolicy()).toMatchObject({ source: 'environment', policy: { enabled: true, days: 14 } });

    await saveRetentionPolicy(policy({ enabled: false, days: 60 }), tenant.adminUser.id);
    expect(await getRetentionPolicy()).toMatchObject({ source: 'saved', policy: { enabled: false, days: 60 }, updatedBy: tenant.adminUser.id });
    expect(await db.select().from(instanceSettings)).toHaveLength(1);
  });

  test('a store that manages lifetimes itself is told first, and a refusal saves nothing', async ({ db, tenant }) => {
    const applied: RetentionPolicy[] = [];
    const ok = wrapStorage({ retention: 'provider', applyRetentionPolicy: async (p) => void applied.push(p) });
    await saveRetentionPolicy(policy({ days: 9 }), tenant.adminUser.id, ok);
    expect(applied).toEqual([policy({ days: 9 })]);

    const refusing = wrapStorage({ retention: 'provider', applyRetentionPolicy: async () => Promise.reject(new Error('AccessDenied')) });
    await expect(saveRetentionPolicy(policy({ days: 3 }), tenant.adminUser.id, refusing)).rejects.toThrow('AccessDenied');
    expect((await getRetentionPolicy()).policy.days).toBe(9);
    void db;
  });
});

describe('updateRetentionPolicy (admin action)', () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    return data;
  };

  test('is for superadmins only', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser); // a team admin, not an instance admin
    expect(await updateRetentionPolicy(null, form({ enabled: 'on', days: '7' }))).toEqual({ ok: false, message: 'Superadmins only.' });
    expect((await getRetentionPolicy()).source).toBe('default');
  });

  test('saves the policy and audits the change', async ({ db, actor }) => {
    const admin = await superadmin();
    actor.signIn(admin);

    const res = await updateRetentionPolicy(null, form({ enabled: 'on', days: '30', 'days.video': '7', 'days.trace': '14', 'days.image': '' }));
    expect(res).toEqual({ ok: true, message: 'Retention policy saved.' });
    expect((await getRetentionPolicy()).policy).toEqual({ enabled: true, days: 30, overrides: { video: 7, trace: 14 } });

    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'storage.retention.update'));
    expect(log.actorId).toBe(admin.id);
    expect(log.target).toMatchObject({ from: { enabled: false }, to: { enabled: true, days: 30 } });
  });

  test('refuses nonsense and keeps what was there', async ({ actor }) => {
    actor.signIn(await superadmin());
    expect(await updateRetentionPolicy(null, form({ enabled: 'on', days: '0' }))).toMatchObject({ ok: false, message: expect.stringMatching(/between 1 and 3650/) });
    expect(await updateRetentionPolicy(null, form({ enabled: 'on', days: '30', 'days.video': 'never' }))).toMatchObject({ ok: false });
    expect((await getRetentionPolicy()).source).toBe('default');
  });
});

describe('sweepExpiredArtifacts', () => {
  test('does nothing while retention is off', async ({ db, tenant, storage }) => {
    const [old] = await uploadedArtifacts(db, tenant, [{ kind: 'video', ageDays: 400 }]);
    expect(await sweepExpiredArtifacts({ trigger: 'cron' })).toEqual({ status: 'disabled' });
    expect(await stored(storage, old.storageKey)).toBe(true);
    expect(await db.select().from(artifactSweeps)).toHaveLength(0);
  });

  test('deletes the bytes of what outlived its kind’s lifetime and marks the rows', async ({ db, tenant, storage }) => {
    await saveRetentionPolicy(policy({ days: 30, overrides: { video: 7 } }), tenant.adminUser.id);
    const [oldVideo, youngVideo, oldTrace, midShot] = await uploadedArtifacts(db, tenant, [
      { kind: 'video', ageDays: 10, bytes: 1000 },
      { kind: 'video', ageDays: 2 },
      { kind: 'trace', ageDays: 31, bytes: 500 },
      { kind: 'screenshot', ageDays: 10 },
    ]);

    const result = await sweepExpiredArtifacts({ trigger: 'cron' });
    expect(result).toMatchObject({ status: 'done', expiredCount: 2, expiredBytes: 1500, hasMore: false, error: null });

    const rows = await rowsById(db, [oldVideo.id, youngVideo.id, oldTrace.id, midShot.id]);
    for (const gone of [oldVideo, oldTrace]) {
      expect(rows.get(gone.id)).toMatchObject({ status: 'expired', expiredAt: expect.any(Date), name: gone.name, sizeBytes: gone.sizeBytes });
      expect(await stored(storage, gone.storageKey)).toBe(false);
    }
    for (const kept of [youngVideo, midShot]) {
      expect(rows.get(kept.id)).toMatchObject({ status: 'uploaded', expiredAt: null });
      expect(await stored(storage, kept.storageKey)).toBe(true);
    }

    const [sweep] = await db.select().from(artifactSweeps);
    expect(sweep).toMatchObject({ trigger: 'cron', storageDriver: 'local', expiredCount: 2, expiredBytes: 1500, hasMore: false, finishedAt: expect.any(Date) });

    // Nothing left to do: a second sweep is a no-op.
    expect(await sweepExpiredArtifacts({ trigger: 'cron' })).toMatchObject({ expiredCount: 0 });
  });

  test('works through a backlog in batches', async ({ db, tenant, storage }) => {
    await saveRetentionPolicy(policy({ days: 1 }), tenant.adminUser.id);
    const rows = await uploadedArtifacts(db, tenant, Array.from({ length: 5 }, () => ({ kind: 'screenshot' as const, ageDays: 3 })));
    expect(await sweepExpiredArtifacts({ trigger: 'manual', batchSize: 2 })).toMatchObject({ expiredCount: 5, hasMore: false });
    for (const r of rows) expect(await stored(storage, r.storageKey)).toBe(false);
  });

  test('stops at its budget and says more is due', async ({ db, tenant }) => {
    await saveRetentionPolicy(policy({ days: 1 }), tenant.adminUser.id);
    await uploadedArtifacts(db, tenant, [{ kind: 'trace', ageDays: 5 }]);
    expect(await sweepExpiredArtifacts({ trigger: 'cron', budgetMs: 0 })).toMatchObject({ expiredCount: 0, hasMore: true });
    expect(await sweepExpiredArtifacts({ trigger: 'cron' })).toMatchObject({ expiredCount: 1, hasMore: false });
  });

  test('leaves rows of another store alone: it could not delete their bytes', async ({ db, tenant }) => {
    await saveRetentionPolicy(policy({ days: 1 }), tenant.adminUser.id);
    const [blob] = await uploadedArtifacts(db, tenant, [{ kind: 'video', ageDays: 5 }]);
    await db.update(attachments).set({ storageDriver: 'vercel-blob' }).where(eq(attachments.id, blob.id));

    expect(await sweepExpiredArtifacts({ trigger: 'cron' })).toMatchObject({ expiredCount: 0 });
    expect((await rowsById(db, [blob.id])).get(blob.id)?.status).toBe('uploaded');
  });

  test('a failing delete keeps the batch live for the next sweep and is recorded', async ({ db, tenant, storage }) => {
    await saveRetentionPolicy(policy({ days: 1 }), tenant.adminUser.id);
    const [row] = await uploadedArtifacts(db, tenant, [{ kind: 'video', ageDays: 5 }]);
    const failing = wrapStorage({ delete: async () => Promise.reject(new Error('blob store unavailable')) });

    expect(await sweepExpiredArtifacts({ trigger: 'cron', storage: failing })).toMatchObject({
      expiredCount: 0,
      hasMore: true,
      error: 'blob store unavailable',
    });
    expect((await rowsById(db, [row.id])).get(row.id)?.status).toBe('uploaded');
    expect(await stored(storage, row.storageKey)).toBe(true);
    expect((await db.select().from(artifactSweeps))[0].error).toBe('blob store unavailable');

    expect(await sweepExpiredArtifacts({ trigger: 'cron' })).toMatchObject({ expiredCount: 1, error: null });
  });

  test('with provider-managed lifetimes it marks the rows and deletes nothing', async ({ db, tenant, storage }) => {
    await saveRetentionPolicy(policy({ days: 1 }), tenant.adminUser.id);
    const [row] = await uploadedArtifacts(db, tenant, [{ kind: 'trace', ageDays: 5 }]);
    const deleted: string[][] = [];
    const provider = wrapStorage({ retention: 'provider', delete: async (keys) => void deleted.push(keys) });

    expect(await sweepExpiredArtifacts({ trigger: 'cron', storage: provider })).toMatchObject({ expiredCount: 1 });
    expect(deleted).toEqual([]);
    expect((await rowsById(db, [row.id])).get(row.id)?.status).toBe('expired');
    expect(await stored(storage, row.storageKey)).toBe(true);
  });

  test('two sweeps at once never expire the same artifact twice', async ({ db, tenant }) => {
    await saveRetentionPolicy(policy({ days: 1 }), tenant.adminUser.id);
    await uploadedArtifacts(db, tenant, Array.from({ length: 6 }, () => ({ kind: 'screenshot' as const, ageDays: 2 })));
    const [a, b] = await Promise.all([
      sweepExpiredArtifacts({ trigger: 'cron', batchSize: 1 }),
      sweepExpiredArtifacts({ trigger: 'ingest', batchSize: 1 }),
    ]);
    const total = (a.status === 'done' ? a.expiredCount : 0) + (b.status === 'done' ? b.expiredCount : 0);
    expect(total).toBe(6);
  });
});

describe('retentionStats', () => {
  test('counts stored, due and expired artifacts per kind', async ({ db, tenant }) => {
    const saved = policy({ enabled: false, days: 30, overrides: { video: 7 } });
    await saveRetentionPolicy(saved, tenant.adminUser.id);
    await uploadedArtifacts(db, tenant, [
      { kind: 'video', ageDays: 10, bytes: 100 },
      { kind: 'video', ageDays: 1, bytes: 50 },
      { kind: 'screenshot', ageDays: 10, bytes: 5 },
    ]);

    // Due is a preview, counted while the policy is still off.
    const before = await retentionStats(saved);
    expect(before.find((r) => r.kind === 'video')).toMatchObject({ liveCount: 2, liveBytes: 150, dueCount: 1, dueBytes: 100, expiredCount: 0 });
    expect(before.find((r) => r.kind === 'screenshot')).toMatchObject({ liveCount: 1, dueCount: 0 });

    await saveRetentionPolicy({ ...saved, enabled: true }, tenant.adminUser.id);
    await sweepExpiredArtifacts({ trigger: 'manual' });
    const after = await retentionStats(saved);
    expect(after.find((r) => r.kind === 'video')).toMatchObject({ liveCount: 1, liveBytes: 50, dueCount: 0, expiredCount: 1, expiredBytes: 100 });
  });
});

describe('triggers', () => {
  test('the cron endpoint is shut without CRON_SECRET and needs it exactly', async ({ db, tenant }) => {
    await saveRetentionPolicy(policy({ days: 1 }), tenant.adminUser.id);
    await uploadedArtifacts(db, tenant, [{ kind: 'video', ageDays: 3 }]);
    const call = (auth?: string) =>
      cronRoute(new Request('http://test.local/api/cron/artifact-retention', { headers: auth ? { authorization: auth } : {} }));

    expect((await call('Bearer anything')).status).toBe(503);

    vi.stubEnv('CRON_SECRET', 'cron-secret-value');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect(await db.select().from(artifactSweeps)).toHaveLength(0);

    const res = await call('Bearer cron-secret-value');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'done', expiredCount: 1 });
    expect((await db.select().from(artifactSweeps))[0].trigger).toBe('cron');
  });

  test('a finished run sweeps at most every twelve hours, and only where allowed', async ({ db, tenant }) => {
    await saveRetentionPolicy(policy({ days: 1 }), tenant.adminUser.id);
    await uploadedArtifacts(db, tenant, [{ kind: 'video', ageDays: 3 }]);

    // Off in this suite's setup, like on a Vercel preview.
    expect(await sweepAfterIngest()).toEqual({ status: 'skipped' });

    vi.stubEnv('ARTIFACT_RETENTION_INGEST_SWEEP', 'on');
    expect(await sweepAfterIngest()).toMatchObject({ status: 'done', expiredCount: 1 });
    await uploadedArtifacts(db, tenant, [{ kind: 'video', ageDays: 3 }]);
    expect(await sweepAfterIngest()).toEqual({ status: 'skipped' });

    // Once the last sweep is old enough, the next finished run takes over.
    await db.update(artifactSweeps).set({ startedAt: new Date(Date.now() - 13 * 3_600_000) });
    expect(await sweepAfterIngest()).toMatchObject({ status: 'done', expiredCount: 1 });
    expect((await db.select().from(artifactSweeps)).map((s) => s.trigger)).toEqual(['ingest', 'ingest']);
  });

  test('"Run now" is for superadmins, refuses while off, and is audited', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await runRetentionSweep()).toEqual({ ok: false, message: 'Superadmins only.' });

    const admin = await superadmin();
    actor.signIn(admin);
    expect(await runRetentionSweep()).toMatchObject({ ok: false, message: expect.stringMatching(/Turn retention on/) });

    await saveRetentionPolicy(policy({ days: 1 }), admin.id);
    await uploadedArtifacts(db, tenant, [{ kind: 'trace', ageDays: 2, bytes: 42 }]);
    expect(await runRetentionSweep()).toEqual({ ok: true, expiredCount: 1, expiredBytes: 42, hasMore: false });
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'storage.retention.sweep'));
    expect(log).toMatchObject({ actorId: admin.id, target: { expired: 1, bytes: 42 } });
  });
});

describe('old runs after expiry', () => {
  const fetchArtifact = (id: string) => artifactRoute(new Request(`http://test.local/api/artifacts/${id}`), { params: Promise.resolve({ attachmentId: id }) });

  test('an expired artifact answers 410 Gone, not a broken 404', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await saveRetentionPolicy(policy({ days: 7 }), tenant.adminUser.id);
    const [old, fresh] = await uploadedArtifacts(db, tenant, [
      { kind: 'trace', ageDays: 8 },
      { kind: 'trace', ageDays: 1 },
    ]);
    await sweepExpiredArtifacts({ trigger: 'cron' });

    expect((await fetchArtifact(old.id)).status).toBe(410);
    expect((await fetchArtifact(fresh.id)).status).toBe(200);
  });

  test('the 410 still needs access: it must not confirm an artifact exists', async ({ db, tenant, actor }) => {
    await saveRetentionPolicy(policy({ days: 7 }), tenant.adminUser.id);
    const [old] = await uploadedArtifacts(db, tenant, [{ kind: 'trace', ageDays: 8 }]);
    await sweepExpiredArtifacts({ trigger: 'cron' });
    actor.signIn(null);
    expect((await fetchArtifact(old.id)).status).toBe(404);
  });

  test('with app retention a missing object is a fault and stays a 404', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const [row] = await uploadedArtifacts(db, tenant, [{ kind: 'trace', ageDays: 1 }]);
    await getStorage().delete([row.storageKey]);

    expect((await fetchArtifact(row.id)).status).toBe(404);
    expect((await rowsById(db, [row.id])).get(row.id)?.status).toBe('uploaded');
  });

  test('with provider retention a vanished object is recorded as expired on first read', async ({ db, tenant }) => {
    const [row] = await uploadedArtifacts(db, tenant, [{ kind: 'video', ageDays: 40 }]);
    const provider = wrapStorage({ retention: 'provider' });
    expect(await markMissingExpired(row.id, provider)).toBe(true);
    expect((await rowsById(db, [row.id])).get(row.id)).toMatchObject({ status: 'expired', expiredAt: expect.any(Date) });
    // Once is enough; app-retention stores never mark.
    expect(await markMissingExpired(row.id, provider)).toBe(false);
    expect(await markMissingExpired(row.id, getStorage())).toBe(false);
  });
});
