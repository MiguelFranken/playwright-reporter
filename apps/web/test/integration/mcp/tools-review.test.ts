/**
 * The review checkpoint tools end to end: list a run's checkpoints, look at
 * one next to its baseline, and decide — only with a write-scoped token.
 */
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { attachments } from '@/lib/db/schema';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from '../factories';
import { createMember, describe, expect, test, type Tenant } from '../fixtures';
import { call, createPat, mcpClient } from './client';

const KEY = 'tests/checkout.spec.ts::places an order';

async function reviewRun(tenant: Tenant, sha: string) {
  const started = await startRun(tenant.tokenProject, runStart());
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const desktop = attachmentRef({ name: 'review:checkout-ready:desktop' });
  const checkpoints: Checkpoint[] = [{ name: 'checkout-ready', title: 'Checkout filled in', sequence: 0, variants: [{ variant: 'desktop', attachmentId: desktop.id, sha256: sha, viewport: { width: 1280, height: 720 } }] }];
  await ingestEvents(
    tenant.tokenProject,
    run,
    eventBatch([testBegin({ seq: 0, testKey: KEY, title: 'places an order', file: 'tests/checkout.spec.ts' }), attemptEnd({ seq: 1, testKey: KEY, attachments: [desktop], checkpoints })]),
  );
  return started.runNumber;
}

describe('review checkpoint tools', () => {
  test('lists, shows and approves; a read-only token cannot decide', async ({ db, tenant }) => {
    const first = await reviewRun(tenant, 'a'.repeat(64));
    await db.update(attachments).set({ status: 'uploaded' });
    const project = `${tenant.team.slug}/${tenant.project.slug}`;

    const reader = await mcpClient({ token: (await createPat(tenant.adminUser)).token });
    expect((await reader.listTools()).tools.map((t) => t.name)).not.toContain('review_checkpoint');
    const listed = await call(reader, 'list_review_checkpoints', { project, run: first });
    expect(listed.isError).toBeFalsy();
    expect(listed.structuredContent).toMatchObject({
      run: first,
      counts: { new: 1, changed: 0, approved: 0 },
      tests: [{ title: expect.stringContaining('places an order'), checkpoints: [{ order: 1, name: 'checkout-ready', title: 'Checkout filled in', captures: [{ variant: 'desktop', status: 'new' }] }] }],
    });
    const captureId = (listed.structuredContent!.tests as { checkpoints: { captures: { captureId: string }[] }[] }[])[0].checkpoints[0].captures[0].captureId;

    const shown = await call(reader, 'get_review_checkpoint', { project, capture: captureId });
    expect(shown.isError).toBeFalsy();
    expect(shown.structuredContent).toMatchObject({ checkpoint: 'Checkout filled in', variant: 'desktop', status: 'new', viewport: '1280×720', reference: null });
    await reader.close();

    const writer = await mcpClient({ token: (await createPat(tenant.adminUser, { scopes: ['read', 'write'] })).token });
    const approved = await call(writer, 'review_checkpoint', { project, captures: [captureId], decision: 'approved' });
    expect(approved.structuredContent).toMatchObject({ decided: 1, decision: 'approved' });

    // The same pixels in the next run need no review; different ones are changed.
    const same = await reviewRun(tenant, 'a'.repeat(64));
    const changed = await reviewRun(tenant, 'b'.repeat(64));
    const sameList = await call(writer, 'list_review_checkpoints', { project, run: same });
    expect(sameList.structuredContent).toMatchObject({ counts: { approved: 1, new: 0 }, tests: [] });
    const changedList = await call(writer, 'list_review_checkpoints', { project, run: changed, status: 'all' });
    expect(changedList.structuredContent).toMatchObject({ counts: { changed: 1 }, tests: [{ checkpoints: [{ captures: [{ status: 'changed', sameAsBaseline: false, baselineRun: first }] }] }] });
    await writer.close();
  });

  test('a viewer cannot decide, even with a write-scoped token', async ({ db, tenant }) => {
    await reviewRun(tenant, 'c'.repeat(64));
    const viewer = await createMember(db, tenant.team.id, 'viewer');
    const client = await mcpClient({ token: (await createPat(viewer, { scopes: ['read', 'write'] })).token });
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    const listed = await call(client, 'list_review_checkpoints', { project });
    const captureId = (listed.structuredContent!.tests as { checkpoints: { captures: { captureId: string }[] }[] }[])[0].checkpoints[0].captures[0].captureId;
    const denied = await call(client, 'review_checkpoint', { project, captures: [captureId], decision: 'approved' });
    expect(denied.isError).toBe(true);
    await client.close();
  });
});
