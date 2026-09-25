/**
 * The RPC procedures the live views and the explorer drawer call instead of
 * re-rendering a route: rows by id, runs by id, a finished run's summary and a
 * test's overview. Called through the real route handler with oRPC's client,
 * so the wire format (dates included) is what the browser gets.
 */
import { createORPCClient, ORPCError } from '@orpc/client';
import { eq } from 'drizzle-orm';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { POST } from '@/app/api/rpc/[[...rest]]/route';
import { tests } from '@/lib/db/schema';
import type { AppRouter } from '@/lib/rpc/router';
import { playRun } from './factories';
import { createMember, createTenant, describe, expect, test } from './fixtures';

const client: RouterClient<AppRouter> = createORPCClient(
  new RPCLink({ origin: 'http://test.local', url: '/api/rpc', fetch: (url, init) => POST(new Request(url, init)) }),
);

async function codeOf(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    if (error instanceof ORPCError) return error.code;
    throw error;
  }
  return 'OK';
}

describe('runs.items', () => {
  test('runs by id carry their counts, shards, own cursor and real dates', async ({ tenant, actor }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed', title: 'a' }, { outcome: 'failed', title: 'b' }] });
    actor.signIn(tenant.adminUser);

    const { runs } = await client.runs.items({ team: tenant.team.slug, project: tenant.project.slug, ids: [runId, 'not-a-uuid'] });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: runId, status: 'failed', counts: { total: 2, passed: 1, failed: 1 }, shards: [{ shardIndex: 1 }] });
    expect(runs[0].cursor).toBeGreaterThan(0);
    expect(runs[0].startedAt).toBeInstanceOf(Date);
  });

  test('never returns another project’s run', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    const { runId } = await playRun(other.tokenProject, { tests: [{ outcome: 'passed' }] });
    actor.signIn(tenant.adminUser);

    const { runs } = await client.runs.items({ team: tenant.team.slug, project: tenant.project.slug, ids: [runId] });
    expect(runs).toEqual([]);
  });
});

describe('runs.summary and runs.results', () => {
  test('a finished run’s summary has the header and, on request, specs and errors', async ({ tenant, actor }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed', title: 'a' }, { outcome: 'failed', title: 'b' }] });
    actor.signIn(tenant.adminUser);
    const ref = { team: tenant.team.slug, project: tenant.project.slug, runId };

    const body = await client.runs.summary({ ...ref, parts: ['specs', 'errors'] });
    expect(body.header.run).toMatchObject({ status: 'failed' });
    expect(body.header.counts).toMatchObject({ total: 2, failed: 1 });
    expect(body.specs!.length).toBeGreaterThan(0);
    expect(Array.isArray(body.errors)).toBe(true);

    const bare = await client.runs.summary(ref);
    expect(bare.specs).toBeNull();
    expect(bare.errors).toBeNull();
  });

  test('rows by id come back as the summary table renders them', async ({ tenant, actor }) => {
    const played = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    actor.signIn(tenant.adminUser);
    const ref = { team: tenant.team.slug, project: tenant.project.slug, runId: played.runId };

    expect((await client.runs.results({ ...ref, ids: [] })).rows).toEqual([]);
  });

  test('another project’s run is NOT_FOUND', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    const { runId } = await playRun(other.tokenProject, { tests: [{ outcome: 'passed' }] });
    actor.signIn(tenant.adminUser);
    expect(await codeOf(client.runs.summary({ team: tenant.team.slug, project: tenant.project.slug, runId }))).toBe('NOT_FOUND');
  });
});

describe('tests.overview', () => {
  test('a test’s overview for the drawer, and NOT_FOUND for an unknown test', async ({ db, tenant, actor }) => {
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'failed', title: 'checkout works', error: 'Expected 3, received 2' }] });
    actor.signIn(tenant.adminUser);
    const [row] = await db.select({ id: tests.id }).from(tests).where(eq(tests.projectId, tenant.project.id));
    const ref = { team: tenant.team.slug, project: tenant.project.slug, days: 30 };

    const overview = await client.tests.overview({ ...ref, testId: row.id });
    expect(overview.test).toMatchObject({ id: row.id });
    expect(await codeOf(client.tests.overview({ ...ref, testId: '00000000-0000-4000-8000-000000000000' }))).toBe('NOT_FOUND');
  });
});

describe('access', () => {
  test('signed out is UNAUTHORIZED; a project the user cannot read is NOT_FOUND', async ({ db, tenant, actor }) => {
    const input = { team: tenant.team.slug, project: tenant.project.slug, ids: [] };
    actor.signIn(null);
    expect(await codeOf(client.runs.items(input))).toBe('UNAUTHORIZED');

    const other = await createTenant(db);
    actor.signIn(await createMember(db, other.team.id, 'viewer'));
    expect(await codeOf(client.runs.items(input))).toBe('NOT_FOUND');
  });

  test('refuses cross-site requests', async () => {
    const response = await POST(new Request('http://test.local/api/rpc/runs/items', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }));
    expect(response.status).toBe(403);
  });
});
