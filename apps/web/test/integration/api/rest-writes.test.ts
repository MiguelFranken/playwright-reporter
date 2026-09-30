/**
 * The REST API's write endpoints through the route handler: the test case
 * library, review decisions and library references change only with a
 * write-scoped token and a role that may make the change. Also the run result
 * filters the run page offers (tags, attachment kinds).
 */
import type { Checkpoint } from '@miguelfranken/protocol';
import { GET, PATCH, POST } from '@/app/api/v1/[[...rest]]/route';
import { attachments } from '@/lib/db/schema';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { attachmentRef, attemptEnd, eventBatch, playRun, runStart, testBegin } from '../factories';
import { createMember, describe, expect, test, type Tenant } from '../fixtures';
import { createPat } from '../mcp/client';

const projectPath = (tenant: Tenant) => `/projects/${tenant.team.slug}/${tenant.project.slug}`;

function get(path: string, token: string) {
  return GET(new Request(`http://test.local/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } }));
}

function send(method: 'POST' | 'PATCH', path: string, token: string, body: unknown) {
  const handler = method === 'POST' ? POST : PATCH;
  return handler(
    new Request(`http://test.local/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const writer = (tenant: Tenant) => createPat(tenant.adminUser, { scopes: ['read', 'write'] }).then((t) => t.token);

describe('REST test case writes', () => {
  test('a read-only token is refused with 403 and changes nothing', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser);
    const response = await send('POST', `${projectPath(tenant)}/test-cases`, token, { title: 'Pay by card' });
    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await json(response)).toMatchObject({ code: 'INSUFFICIENT_SCOPE' });
    expect(await json(await get(`${projectPath(tenant)}/test-cases`, token))).toMatchObject({ total: 0 });
  });

  test('a viewer’s write-scoped token cannot create, and learns nothing about the project', async ({ db, tenant }) => {
    const viewer = await createMember(db, tenant.team.id, 'viewer');
    const { token } = await createPat(viewer, { scopes: ['read', 'write'] });
    const response = await send('POST', `${projectPath(tenant)}/test-cases`, token, { title: 'Pay by card' });
    expect(response.status).toBe(404);
  });

  test('creates, edits, links and adopts cases, and manages suites', async ({ tenant }) => {
    await playRun(tenant.tokenProject, {
      tests: [
        { title: 'pays by card', file: 'tests/checkout.spec.ts', outcome: 'passed' },
        { title: 'logs in', file: 'tests/login.spec.ts', outcome: 'passed' },
      ],
    });
    const token = await writer(tenant);
    const base = projectPath(tenant);

    const created = await send('POST', `${base}/test-cases`, token, {
      title: 'Pay by card',
      suite: 'Checkout / Payment',
      priority: 'high',
      steps: [{ action: 'Enter a card', expected: 'The order is placed' }],
    });
    expect(created.status).toBe(201);
    expect(await json(created)).toMatchObject({ key: 'TC-1', title: 'Pay by card', version: 1 });

    const invalid = await send('POST', `${base}/test-cases`, token, { priority: 'high' });
    expect(invalid.status).toBe(400);

    const updated = await send('PATCH', `${base}/test-cases/TC-1`, token, { status: 'active', addTags: ['smoke'], expectedVersion: 1 });
    expect(updated.status).toBe(200);
    expect(await json(updated)).toMatchObject({ key: 'TC-1', version: 2 });
    const stale = await send('PATCH', `${base}/test-cases/TC-1`, token, { title: 'Too late', expectedVersion: 1 });
    expect(stale.status).toBe(400);

    // Priority, of one case and of many.
    const critical = await send('PATCH', `${base}/test-cases/TC-1`, token, { priority: 'critical' });
    expect(await json(critical)).toMatchObject({ key: 'TC-1', version: 3 });
    expect(await json(await get(`${base}/test-cases/TC-1`, token))).toMatchObject({ priority: 'critical' });
    expect((await send('PATCH', `${base}/test-cases/TC-1`, token, { priority: 'urgent' })).status).toBe(400);
    await send('POST', `${base}/test-cases`, token, { title: 'Pay by invoice' });
    const bulk = await send('POST', `${base}/test-cases/bulk`, token, { cases: ['TC-1', 'TC-2'], priority: 'low' });
    expect(bulk.status).toBe(200);
    expect(await json(bulk)).toMatchObject({ updated: 2, cases: ['TC-1', 'TC-2'] });
    expect(await json(await get(`${base}/test-cases?priority=low`, token))).toMatchObject({ total: 2 });
    expect((await send('POST', `${base}/test-cases/bulk`, token, { cases: [] })).status).toBe(400);
    const readOnly = await createPat(tenant.adminUser);
    expect((await send('POST', `${base}/test-cases/bulk`, readOnly.token, { cases: ['TC-1'], priority: 'high' })).status).toBe(403);

    const tests = await json<{ tests: { testId: string; title: string }[] }>(await get(`${base}/tests?search=pays`, token));
    const cardTest = tests.tests[0].testId;
    const linked = await send('POST', `${base}/test-cases/TC-1/links`, token, { link: [cardTest] });
    expect(await json(linked)).toMatchObject({ key: 'TC-1', linked: 1, unlinked: 0 });
    expect(await json(await get(`${base}/test-cases/TC-1`, token))).toMatchObject({ automation: 'automated', tags: ['smoke'], linkedTests: [{ title: expect.stringContaining('pays by card') }] });

    const loginTest = (await json<{ tests: { testId: string }[] }>(await get(`${base}/tests?search=logs`, token))).tests[0].testId;
    const adopted = await send('POST', `${base}/test-cases/adopt`, token, { tests: [loginTest, cardTest], suite: 'Accounts' });
    expect(adopted.status).toBe(201);
    expect(await json(adopted)).toMatchObject({ created: [{ key: 'TC-3' }], skipped: 1 });

    const suite = await send('POST', `${base}/test-suites`, token, { name: 'Empty', parent: 'Checkout' });
    expect(suite.status).toBe(201);
    expect(await json(suite)).toMatchObject({ path: 'Checkout / Empty' });
    const refused = await send('POST', `${base}/test-suites/delete-empty`, token, { suites: ['Checkout'] });
    expect(refused.status).toBe(400);
    const pruned = await send('POST', `${base}/test-suites/delete-empty`, token, { allEmpty: true });
    expect(await json(pruned)).toMatchObject({ deleted: ['Checkout / Empty'] });
  });
});

async function reviewRun(tenant: Tenant, git: { branch: string; prNumber?: number }) {
  const started = await startRun(tenant.tokenProject, runStart({ git }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const key = 'tests/checkout.spec.ts::places an order';
  const desktop = attachmentRef({ name: 'review:checkout-ready:desktop' });
  const checkpoints: Checkpoint[] = [
    { name: 'checkout-ready', title: 'Checkout filled in', sequence: 0, variants: [{ variant: 'desktop', attachmentId: desktop.id, sha256: 'a'.repeat(64), viewport: { width: 1280, height: 720 } }] },
  ];
  await ingestEvents(
    tenant.tokenProject,
    run,
    eventBatch([testBegin({ seq: 0, testKey: key, title: 'places an order', file: 'tests/checkout.spec.ts' }), attemptEnd({ seq: 1, testKey: key, attachments: [desktop], checkpoints })]),
  );
  return started.runNumber;
}

describe('REST visual review writes', () => {
  test('approves a review checkpoint image and keeps a pull request in the library', async ({ tenant }) => {
    const prRun = await reviewRun(tenant, { branch: 'feat/checkout', prNumber: 212 });
    const token = await writer(tenant);
    const base = projectPath(tenant);

    const listed = await json<{ tests: { checkpoints: { captures: { captureId: string }[] }[] }[] }>(await get(`${base}/runs/${prRun}/review-checkpoints`, token));
    const captureId = listed.tests[0].checkpoints[0].captures[0].captureId;
    const decided = await send('POST', `${base}/review-captures/decisions`, token, { captures: [captureId], decision: 'approved' });
    expect(decided.status).toBe(200);
    expect(await json(decided)).toMatchObject({ decided: 1, decision: 'approved' });
    expect(await json(await get(`${base}/review-captures/${captureId}`, token))).toMatchObject({ status: 'approved' });

    const kept = await send('POST', `${base}/library/references`, token, { pullRequest: 212, pin: prRun, title: 'New checkout' });
    expect(await json(kept)).toMatchObject({ reference: 'pr:212', kept: true });
    expect(await json(await get(`${base}/library`, token))).toMatchObject({ references: expect.arrayContaining([expect.objectContaining({ reference: 'pr:212', name: 'New checkout', pinnedRun: prRun })]) });
    const noRef = await send('POST', `${base}/library/references`, token, { pin: prRun });
    expect(noRef.status).toBe(400);
  });
});

describe('REST run result filters', () => {
  test('filters a run’s results by tag and attachment kind', async ({ db, tenant }) => {
    const run = await playRun(tenant.tokenProject, {
      tests: [
        { title: 'checkout works', file: 'tests/checkout.spec.ts', outcome: 'failed', tags: ['@smoke'], attachments: [attachmentRef({ name: 'screenshot', contentType: 'image/png' })] },
        { title: 'login works', file: 'tests/login.spec.ts', outcome: 'failed', tags: ['@slow'] },
      ],
    });
    await db.update(attachments).set({ status: 'uploaded' });
    const { token } = await createPat(tenant.adminUser);
    const results = (query: string) => get(`${projectPath(tenant)}/runs/${run.runNumber}/results?${query}`, token).then((r) => json<{ total: number; results: { title: string; tags: string[] }[] }>(r));

    expect(await results('tag=@smoke')).toMatchObject({ total: 1, results: [{ title: expect.stringContaining('checkout works'), tags: ['@smoke'] }] });
    expect((await results('tag=@smoke&tag=@slow')).total).toBe(2);
    expect(await results('artifact=screenshot')).toMatchObject({ total: 1, results: [{ title: expect.stringContaining('checkout works') }] });
    expect(await results('artifact=no-screenshot')).toMatchObject({ total: 1, results: [{ title: expect.stringContaining('login works') }] });
    expect((await results('artifact=screenshot&artifact=no-video')).total).toBe(1);
    expect((await results('artifact=bogus')).total).toBeUndefined();
  });
});
