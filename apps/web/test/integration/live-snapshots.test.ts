/**
 * The JSON endpoints the live views fetch instead of re-rendering a route:
 * rows by id, runs by id, and a finished run's summary.
 */
import { GET as runItems } from '@/app/api/teams/[team]/projects/[project]/runs/items/route';
import { GET as runResults } from '@/app/api/teams/[team]/projects/[project]/runs/[runId]/results/route';
import { GET as runSummary } from '@/app/api/teams/[team]/projects/[project]/runs/[runId]/summary/route';
import { playRun } from './factories';
import { createTenant, describe, expect, test } from './fixtures';

const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });

describe('live snapshot endpoints', () => {
  test('runs by id carry their counts, shards and own cursor', async ({ tenant, actor }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed', title: 'a' }, { outcome: 'failed', title: 'b' }] });
    actor.signIn(tenant.adminUser);

    const res = await runItems(new Request(`http://test.local/x?ids=${runId}`), params({ team: tenant.team.slug, project: tenant.project.slug }));
    const { runs } = await res.json();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: runId, status: 'failed', counts: { total: 2, passed: 1, failed: 1 }, shards: [{ shardIndex: 1 }] });
    expect(runs[0].cursor).toBeGreaterThan(0);
  });

  test('never returns another project’s run', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    const { runId } = await playRun(other.tokenProject, { tests: [{ outcome: 'passed' }] });
    actor.signIn(tenant.adminUser);

    const res = await runItems(new Request(`http://test.local/x?ids=${runId}`), params({ team: tenant.team.slug, project: tenant.project.slug }));
    expect((await res.json()).runs).toEqual([]);
  });

  test('a finished run’s summary has the header and, on request, specs and errors', async ({ tenant, actor }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed', title: 'a' }, { outcome: 'failed', title: 'b' }] });
    actor.signIn(tenant.adminUser);

    const res = await runSummary(
      new Request('http://test.local/x?parts=specs,errors'),
      params({ team: tenant.team.slug, project: tenant.project.slug, runId }),
    );
    const body = await res.json();
    expect(body.header.run).toMatchObject({ status: 'failed' });
    expect(body.header.counts).toMatchObject({ total: 2, failed: 1 });
    expect(body.specs.length).toBeGreaterThan(0);
    expect(Array.isArray(body.errors)).toBe(true);

    const bare = await (await runSummary(new Request('http://test.local/x'), params({ team: tenant.team.slug, project: tenant.project.slug, runId }))).json();
    expect(bare.specs).toBeNull();
    expect(bare.errors).toBeNull();
  });

  test('rows by id come back as the summary table renders them', async ({ tenant, actor }) => {
    const played = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    actor.signIn(tenant.adminUser);
    const params_ = params({ team: tenant.team.slug, project: tenant.project.slug, runId: played.runId });

    const empty = await (await runResults(new Request('http://test.local/x?ids='), params_)).json();
    expect(empty.rows).toEqual([]);
  });
});
