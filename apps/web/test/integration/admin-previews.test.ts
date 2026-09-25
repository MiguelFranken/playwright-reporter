/**
 * The admin RPC procedures behind the retention forms' previews: what a policy
 * would delete if saved as it is being edited. Called through the real route
 * handler, like the browser does.
 */
import { createORPCClient, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { POST } from '@/app/api/rpc/[[...rest]]/route';
import { getDataRetentionPolicy, policyFromForm } from '@/lib/data-retention';
import { runs } from '@/lib/db/schema';
import type { AppRouter } from '@/lib/rpc/router';
import { playRun } from './factories';
import { createUserRow, describe, expect, test } from './fixtures';

const client: RouterClient<AppRouter> = createORPCClient(
  new RPCLink({ origin: 'http://test.local', url: '/api/rpc', fetch: (url, init) => POST(new Request(url, init)) }),
);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function codeOf(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    if (error instanceof ORPCError) return error.code;
    throw error;
  }
  return 'OK';
}

const DATA_FIELDS = { enabled: 'off', runDays: '30', keepLatestRuns: '0', eventDays: '7', auditDays: '', housekeeping: 'off' };

describe('admin.dataRetentionDue', () => {
  test('counts what the edited policy would delete, without saving or deleting anything', async ({ db, tenant, actor }) => {
    const old = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed', title: 'a' }, { outcome: 'failed', title: 'b' }] });
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    await db.update(runs).set({ startedAt: daysAgo(40), finishedAt: daysAgo(40) }).where(eq(runs.id, old.runId));
    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    const before = await getDataRetentionPolicy();

    const due = await client.admin.dataRetentionDue({ fields: DATA_FIELDS });
    expect(due).toMatchObject({ ok: true, enabled: false, due: { runs: 1, results: 2, audit: null, expired: null } });

    // A longer lifetime, or keeping the latest runs, leaves the old run alone.
    expect(await client.admin.dataRetentionDue({ fields: { ...DATA_FIELDS, runDays: '60' } })).toMatchObject({ due: { runs: 0 } });
    expect(await client.admin.dataRetentionDue({ fields: { ...DATA_FIELDS, keepLatestRuns: '5' } })).toMatchObject({ due: { runs: 0 } });

    expect(await db.select().from(runs)).toHaveLength(2);
    expect(await getDataRetentionPolicy()).toEqual(before);
  });

  test('refuses what the save would refuse, with the same message', async ({ db, actor }) => {
    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    const fields: Record<string, string> = { ...DATA_FIELDS, runDays: '0' };
    const expected = policyFromForm({ get: (name) => fields[name] ?? null });
    expect(typeof expected).toBe('string');
    expect(await client.admin.dataRetentionDue({ fields })).toEqual({ ok: false, message: expected });
  });

  test('is for superadmins only', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await codeOf(client.admin.dataRetentionDue({ fields: DATA_FIELDS }))).toBe('NOT_FOUND');
    actor.signIn(null);
    expect(await codeOf(client.admin.dataRetentionDue({ fields: DATA_FIELDS }))).toBe('UNAUTHORIZED');
  });
});

describe('admin.artifactRetentionDue', () => {
  test('answers per kind, and refuses what the save would refuse', async ({ db, actor }) => {
    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    expect(await client.admin.artifactRetentionDue({ fields: { enabled: 'on', days: '30' } })).toEqual({ ok: true, enabled: true, rows: [] });
    expect(await client.admin.artifactRetentionDue({ fields: { enabled: 'on', days: '30', 'days.video': 'soon' } })).toEqual({
      ok: false,
      message: 'The video lifetime must be blank or a whole number of days between 1 and 3650.',
    });
  });

  test('is for superadmins only', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await codeOf(client.admin.artifactRetentionDue({ fields: { days: '30' } }))).toBe('NOT_FOUND');
  });
});
