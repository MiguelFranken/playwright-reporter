/**
 * The library tools end to end: list the references, read a reference's
 * flows, and — only with a write-scoped token — keep a pull request and pin
 * its run.
 */
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from '../factories';
import { describe, expect, test, type Tenant } from '../fixtures';
import { call, createPat, mcpClient } from './client';

async function reviewRun(tenant: Tenant, git: { branch: string; prNumber?: number }) {
  const started = await startRun(tenant.tokenProject, runStart({ git: { ...git, prTitle: git.prNumber ? 'Checkout redesign' : undefined } }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const key = 'tests/checkout.spec.ts::places an order';
  const desktop = attachmentRef({ name: 'review:checkout-ready:desktop' });
  const checkpoints: Checkpoint[] = [
    { name: 'checkout-ready', title: 'Checkout filled in', description: 'Every field complete.', sequence: 0, variants: [{ variant: 'desktop', attachmentId: desktop.id, sha256: 'a'.repeat(64), viewport: { width: 1280, height: 720 } }] },
  ];
  await ingestEvents(
    tenant.tokenProject,
    run,
    eventBatch([testBegin({ seq: 0, testKey: key, title: 'places an order', file: 'tests/checkout.spec.ts' }), attemptEnd({ seq: 1, testKey: key, attachments: [desktop], checkpoints })]),
  );
  return started.runNumber;
}

describe('library tools', () => {
  test('lists and reads references; keeping and pinning needs a write-scoped token', async ({ tenant }) => {
    await reviewRun(tenant, { branch: 'main' });
    const prRun = await reviewRun(tenant, { branch: 'feat/checkout', prNumber: 212 });
    const project = `${tenant.team.slug}/${tenant.project.slug}`;

    const reader = await mcpClient({ token: (await createPat(tenant.adminUser)).token });
    expect((await reader.listTools()).tools.map((t) => t.name)).not.toContain('set_library_reference');
    const listed = await call(reader, 'list_library', { project });
    expect(listed.isError).toBeFalsy();
    expect(listed.structuredContent).toMatchObject({ defaultReference: 'branch:main', references: [{ reference: 'branch:main', isDefault: true, kept: false, needsReview: 1 }] });

    const flows = await call(reader, 'get_library_flows', { project });
    expect(flows.structuredContent).toMatchObject({
      reference: 'branch:main',
      total: 1,
      more: false,
      flows: [{ title: expect.stringContaining('places an order'), checkpoints: [{ order: 1, title: 'Checkout filled in', description: 'Every field complete.', captures: [{ variant: 'desktop', viewport: '1280×720' }] }] }],
    });
    expect(String(flows.structuredContent!.url)).toContain('/library?ref=branch%3Amain');
    const both = await call(reader, 'get_library_flows', { project, branch: 'main', pullRequest: 212 });
    expect(both.isError).toBe(true);
    await reader.close();

    const writer = await mcpClient({ token: (await createPat(tenant.adminUser, { scopes: ['read', 'write'] })).token });
    const kept = await call(writer, 'set_library_reference', { project, pullRequest: 212, pin: prRun, title: 'New checkout' });
    expect(kept.structuredContent).toMatchObject({ reference: 'pr:212', kept: true });
    const after = await call(writer, 'list_library', { project });
    expect(after.structuredContent).toMatchObject({ references: [{ reference: 'branch:main' }, { reference: 'pr:212', name: 'New checkout', pinnedRun: prRun, shownRun: prRun }] });
    const wrongRun = await call(writer, 'set_library_reference', { project, pullRequest: 212, pin: 99_999 });
    expect(wrongRun.isError).toBe(true);
    const noRef = await call(writer, 'set_library_reference', { project });
    expect(noRef.isError).toBe(true);
    await writer.close();
  });
});
