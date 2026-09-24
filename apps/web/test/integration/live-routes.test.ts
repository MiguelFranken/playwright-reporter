/**
 * 8.11 — the two SSE route handlers. They are the only place membership is
 * checked before a long-lived stream, so the authorization cases matter as much
 * as the frames.
 */
import { eq } from 'drizzle-orm';
import { GET as projectLive } from '@/app/api/teams/[team]/projects/[project]/live/route';
import { GET as runLive } from '@/app/api/teams/[team]/projects/[project]/runs/[runId]/live/route';
import { finishRun, getRunForProject } from '@/lib/ingest/service';
import { runEvents } from '@/lib/db/schema';
import { playRun, runFinish } from './factories';
import { createMember, createTenant, createUserRow, describe, expect, test } from './fixtures';

const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });

function sseRequest(url: string, headers: HeadersInit = {}) {
  const controller = new AbortController();
  return { request: new Request(url, { headers, signal: controller.signal }), controller };
}

/** Reads frames until `predicate` is satisfied or the stream ends, then aborts. */
async function readUntil(response: Response, controller: AbortController, predicate: (text: string) => boolean) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + 15_000;
  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (value) text += decoder.decode(value, { stream: true });
      if (done || predicate(text)) break;
    }
  } finally {
    controller.abort();
    await reader.cancel().catch(() => undefined);
  }
  return text;
}

describe('authorization', () => {
  test('a member gets a stream on both routes', async ({ tenant, actor }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    actor.signIn(tenant.adminUser);

    const project = sseRequest('http://test.local/live');
    const projectResponse = await projectLive(project.request, params({ team: tenant.team.slug, project: tenant.project.slug }));
    expect(projectResponse.status).toBe(200);
    expect(projectResponse.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(projectResponse.headers.get('cache-control')).toBe('no-cache, no-transform');
    project.controller.abort();
    await projectResponse.body!.cancel();

    const run = sseRequest('http://test.local/live');
    const runResponse = await runLive(run.request, params({ team: tenant.team.slug, project: tenant.project.slug, runId }));
    expect(runResponse.status).toBe(200);
    expect(runResponse.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    run.controller.abort();
    await runResponse.body!.cancel();
  });

  test('somebody without a membership gets a 404, not a stream', async ({ db, tenant, actor }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    const outsider = await createUserRow(db);
    actor.signIn(outsider);

    const project = await projectLive(sseRequest('http://test.local/live').request, params({ team: tenant.team.slug, project: tenant.project.slug }));
    expect(project.status).toBe(404);

    const run = await runLive(sseRequest('http://test.local/live').request, params({ team: tenant.team.slug, project: tenant.project.slug, runId }));
    expect(run.status).toBe(404);
  });

  test('a signed-out visitor gets a 404', async ({ tenant, actor }) => {
    actor.signIn(null);
    const response = await projectLive(sseRequest('http://test.local/live').request, params({ team: tenant.team.slug, project: tenant.project.slug }));
    expect(response.status).toBe(404);
  });

  test('a viewer may read the stream', async ({ db, tenant, actor }) => {
    const viewer = await createMember(db, tenant.team.id, 'viewer');
    actor.signIn(viewer);

    const { request, controller } = sseRequest('http://test.local/live');
    const response = await projectLive(request, params({ team: tenant.team.slug, project: tenant.project.slug }));
    expect(response.status).toBe(200);
    controller.abort();
    await response.body!.cancel();
  });

  test('a run of another project is not reachable through this project', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    const { runId } = await playRun(other.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    actor.signIn(tenant.adminUser);

    const response = await runLive(sseRequest('http://test.local/live').request, params({ team: tenant.team.slug, project: tenant.project.slug, runId }));
    expect(response.status).toBe(404);
  });

  test('a run id that is not a uuid is rejected before it reaches the database', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const response = await runLive(
      sseRequest('http://test.local/live').request,
      params({ team: tenant.team.slug, project: tenant.project.slug, runId: 'not-a-uuid' }),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('not found');
  });
});

describe('the run stream', () => {
  test('replays from a cursor and ends with done once the run is finished', async ({ db, tenant, actor }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    actor.signIn(tenant.adminUser);

    const { request, controller } = sseRequest('http://test.local/live?since=0');
    const response = await runLive(request, params({ team: tenant.team.slug, project: tenant.project.slug, runId }));
    const text = await readUntil(response, controller, (t) => t.includes('event: done'));

    expect(text).toContain('retry: 2000');
    expect(text).toContain('event: run.started');
    expect(text).toContain('event: attempt.end');
    expect(text).toContain('event: run.finished');
    expect(text).toContain('event: done');

    // Ids are the run_events primary keys, so a reconnect can resume.
    const rows = await db.select().from(runEvents).where(eq(runEvents.runId, runId));
    for (const row of rows) expect(text).toContain(`id: ${row.id}\n`);
  });

  test('sends no history when the client offers no cursor', async ({ tenant, actor }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    actor.signIn(tenant.adminUser);

    const { request, controller } = sseRequest('http://test.local/live');
    const response = await runLive(request, params({ team: tenant.team.slug, project: tenant.project.slug, runId }));
    const text = await readUntil(response, controller, (t) => t.includes('event: done'));

    // The page already rendered these, so the stream starts at the newest id.
    expect(text).not.toContain('event: run.started');
    expect(text).toContain('event: done');
  });

  test('stays open while the run is still going', async ({ tenant, actor }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'running' }], finish: false });
    actor.signIn(tenant.adminUser);

    const { request, controller } = sseRequest('http://test.local/live?since=0');
    const response = await runLive(request, params({ team: tenant.team.slug, project: tenant.project.slug, runId }));
    const text = await readUntil(response, controller, (t) => t.includes('event: test.begin'));

    expect(text).toContain('event: test.begin');
    expect(text).not.toContain('event: done');
  });

  test('picks up an event that arrives after the client connected', async ({ tenant, actor }) => {
    const played = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }], finish: false });
    actor.signIn(tenant.adminUser);

    const { request, controller } = sseRequest('http://test.local/live');
    const response = await runLive(request, params({ team: tenant.team.slug, project: tenant.project.slug, runId: played.runId }));
    const reading = readUntil(response, controller, (t) => t.includes('event: done'));

    const run = await getRunForProject(tenant.tokenProject, played.runId);
    await finishRun(tenant.tokenProject, run, runFinish({ status: 'passed' }));

    const text = await reading;
    expect(text).toContain('event: run.finished');
    expect(text).toContain('event: done');
  });
});

describe('the project stream', () => {
  test('carries the events of every run in the project', async ({ tenant, actor }) => {
    await playRun(tenant.tokenProject, { ciRunId: 'a', tests: [{ outcome: 'passed' }] });
    await playRun(tenant.tokenProject, { ciRunId: 'b', tests: [{ outcome: 'failed' }] });
    actor.signIn(tenant.adminUser);

    const { request, controller } = sseRequest('http://test.local/live?since=0');
    const response = await projectLive(request, params({ team: tenant.team.slug, project: tenant.project.slug }));
    // There is no `done` on a project stream; read until both runs showed up.
    const text = await readUntil(response, controller, (t) => (t.match(/event: run.finished/g) ?? []).length >= 2);

    expect((text.match(/event: run\.started/g) ?? []).length).toBe(2);
    expect((text.match(/event: run\.finished/g) ?? []).length).toBe(2);
    expect(text).not.toContain('event: done');
  });

  test('never leaks another project’s events', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    await playRun(other.tokenProject, { tests: [{ outcome: 'failed', title: 'a secret test' }] });
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed', title: 'our own test' }] });
    actor.signIn(tenant.adminUser);

    const { request, controller } = sseRequest('http://test.local/live?since=0');
    const response = await projectLive(request, params({ team: tenant.team.slug, project: tenant.project.slug }));
    const text = await readUntil(response, controller, (t) => t.includes('run.finished'));

    expect(text).toContain('our own test');
    expect(text).not.toContain('a secret test');
  });
});
