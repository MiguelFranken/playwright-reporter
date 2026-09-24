/**
 * Browser push: which ingest calls announce a run, who hears about it, and
 * what happens to subscriptions a push service reports gone. `web-push` is
 * mocked; everything up to the send is real.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { WebPushError } from 'web-push';
import { deletePushSubscription, savePushSubscription } from '@/app/(app)/account/push-actions';
import { finishRun, getRunForProject, startRun } from '@/lib/ingest/service';
import { pushSubscriptions, runs, users } from '@/lib/db/schema';
import { notifyRun } from '@/lib/push/notify';
import { checkStaleRun } from '@/lib/runs/lifecycle';
import { playRun, runFinish, runStart } from './factories';
import { createMember, createTenant, describe, expect, test, type Db } from './fixtures';

const send = vi.hoisted(() => vi.fn());
vi.mock('web-push', async (importOriginal) => {
  const mod = await importOriginal<typeof import('web-push') & { default: typeof import('web-push') }>();
  return { ...mod, default: { ...mod.default, sendNotification: send }, sendNotification: send };
});

beforeEach(() => {
  process.env.VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  send.mockReset().mockResolvedValue({ statusCode: 201 });
});
afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

async function subscribe(db: Db, userId: string, prefs: { notifyStarted?: boolean; notifyFinished?: boolean } = {}) {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
  await db.insert(pushSubscriptions).values({ userId, endpoint, p256dh: 'p256dh', auth: 'auth', ...prefs });
  return endpoint;
}

const sentTo = () => send.mock.calls.map(([sub]) => (sub as { endpoint: string }).endpoint).sort();
const sentMessages = () => send.mock.calls.map(([, payload]) => JSON.parse(payload as string) as { title: string; url: string });

describe('ingest effects', () => {
  test('only the first shard announces a start', async ({ db, tenant }) => {
    void db;
    const first = await startRun(tenant.tokenProject, runStart({ ciRunId: 'ci-1', shard: { current: 1, total: 2 } }));
    const second = await startRun(tenant.tokenProject, runStart({ ciRunId: 'ci-1', shard: { current: 2, total: 2 } }));
    expect(first.push).toEqual({ runId: first.runId, kind: 'started' });
    expect(second.push).toBeNull();
  });

  test('only the last shard to finish announces the result, once', async ({ db, tenant }) => {
    void db;
    const { runId } = await startRun(tenant.tokenProject, runStart({ ciRunId: 'ci-2', shard: { current: 1, total: 2 } }));
    await startRun(tenant.tokenProject, runStart({ ciRunId: 'ci-2', shard: { current: 2, total: 2 } }));
    const run = await getRunForProject(tenant.tokenProject, runId);
    expect((await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 1 }))).push).toBeNull();
    expect((await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 2 }))).push).toEqual({ runId, kind: 'finished' });
    // A repeated finish call settles the run again but is not news.
    expect((await finishRun(tenant.tokenProject, run, runFinish({ shardIndex: 2 }))).push).toBeNull();
  });
});

describe('notifyRun', () => {
  test("reaches the team's members who want this kind of event, and nobody else", async ({ db, tenant }) => {
    const member = await createMember(db, tenant.team.id, 'viewer');
    const quiet = await createMember(db, tenant.team.id, 'member');
    const outsider = (await createTenant(db)).adminUser;
    const a = await subscribe(db, tenant.adminUser.id);
    const b = await subscribe(db, member.id);
    await subscribe(db, quiet.id, { notifyStarted: false });
    await subscribe(db, outsider.id);

    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }], finish: false });
    await notifyRun(runId, 'started');

    expect(sentTo()).toEqual([a, b].sort());
    expect(sentMessages()[0]).toMatchObject({
      title: `${tenant.project.name}: run #1 started`,
      url: `/teams/${tenant.team.slug}/projects/${tenant.project.slug}/runs/1`,
    });
  });

  test('a finish reports the counts, and skips banned users', async ({ db, tenant }) => {
    const banned = await createMember(db, tenant.team.id, 'member');
    await db.update(users).set({ banned: true }).where(eq(users.id, banned.id));
    await subscribe(db, banned.id);
    const a = await subscribe(db, tenant.adminUser.id);

    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }, { outcome: 'failed', title: 'breaks' }] });
    await notifyRun(runId, 'finished');

    expect(sentTo()).toEqual([a]);
    expect(sentMessages()[0].title).toBe(`${tenant.project.name}: run #1 failed`);
    expect((sentMessages()[0] as unknown as { body: string }).body).toMatch(/^1 failed, 1 passed/);
  });

  test('deletes a subscription the push service reports gone, and keeps one that failed otherwise', async ({ db, tenant }) => {
    const gone = await subscribe(db, tenant.adminUser.id);
    const flaky = await subscribe(db, tenant.adminUser.id);
    send.mockImplementation(async (sub: { endpoint: string }) => {
      throw new WebPushError('failed', sub.endpoint === gone ? 410 : 500, {}, '', sub.endpoint);
    });
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(notifyRun(runId, 'finished')).resolves.toBeUndefined();

    error.mockRestore();
    const left = await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions);
    expect(left.map((s) => s.endpoint)).toEqual([flaky]);
  });

  test('sends nothing without VAPID keys', async ({ db, tenant }) => {
    delete process.env.VAPID_PUBLIC_KEY;
    await subscribe(db, tenant.adminUser.id);
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    await notifyRun(runId, 'finished');
    expect(send).not.toHaveBeenCalled();
  });

  test('the watchdog closing a run is announced as a finish', async ({ db, tenant }) => {
    await subscribe(db, tenant.adminUser.id);
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    await db.update(runs).set({ lastEventAt: new Date(Date.now() - 10 * 60_000) }).where(eq(runs.id, runId));
    expect(await checkStaleRun(runId)).toEqual({ state: 'closed' });
    // `checkRun` (the watchdog step) sends it; the step itself runs in the workflow project.
    await notifyRun(runId, 'finished');
    expect(sentMessages()[0].title).toBe(`${tenant.project.name}: run #1 abandoned`);
  });
});

describe('subscription actions', () => {
  const keys = { p256dh: 'p256dh', auth: 'auth' };

  test('store a subscription for the caller, and move a known endpoint to them', async ({ db, tenant, actor }) => {
    const other = await createMember(db, tenant.team.id, 'member');
    const endpoint = await subscribe(db, other.id);
    actor.signIn(tenant.adminUser);

    expect(await savePushSubscription({ endpoint, keys, notifyStarted: false, notifyFinished: true })).toEqual({ ok: true });

    const [row] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    expect(row).toMatchObject({ userId: tenant.adminUser.id, notifyStarted: false, notifyFinished: true });
  });

  test('refuse an endpoint that is not a push service', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const res = await savePushSubscription({ endpoint: 'https://internal.example/hook', keys, notifyStarted: true, notifyFinished: true });
    expect(res.ok).toBe(false);
    expect(await db.select().from(pushSubscriptions)).toEqual([]);
  });

  test("delete only the caller's own subscription", async ({ db, tenant, actor }) => {
    const other = await createMember(db, tenant.team.id, 'member');
    const theirs = await subscribe(db, other.id);
    const mine = await subscribe(db, tenant.adminUser.id);
    actor.signIn(tenant.adminUser);

    await deletePushSubscription(theirs);
    await deletePushSubscription(mine);

    const left = await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions);
    expect(left.map((s) => s.endpoint)).toEqual([theirs]);
  });

  test('require a signed-in user', async ({ db, actor }) => {
    void db;
    actor.signIn(null);
    const res = await savePushSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys, notifyStarted: true, notifyFinished: true });
    expect(res.ok).toBe(false);
  });
});
