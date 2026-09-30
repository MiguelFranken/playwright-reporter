/**
 * The library tools end to end: list the references, read a reference's
 * flows, and — only with a write-scoped token — keep a pull request and pin
 * its run.
 */
import type { Checkpoint } from '@miguelfranken/protocol';
import { getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';
import { attachmentRef, attemptEnd, eventBatch, runStart, testBegin } from '../factories';
import { describe, expect, test, type Tenant } from '../fixtures';
import { libraryFlows } from '@/lib/review/library';
import { createLibraryView } from '@/lib/review/library-views';
import { createThread } from '@/lib/review/threads';
import { call, createPat, mcpClient } from './client';

async function reviewRun(tenant: Tenant, git: { branch: string; prNumber?: number }, hash = 'a', startedAt = new Date()) {
  const started = await startRun(tenant.tokenProject, runStart({ startedAt: startedAt.toISOString(), git: { ...git, prTitle: git.prNumber ? 'Checkout redesign' : undefined } }));
  const run = await getRunForProject(tenant.tokenProject, started.runId);
  const key = 'tests/checkout.spec.ts::places an order';
  const desktop = attachmentRef({ name: 'review:checkout-ready:desktop' });
  const checkpoints: Checkpoint[] = [
    { name: 'checkout-ready', title: 'Checkout filled in', description: 'Every field complete.', sequence: 0, variants: [{ variant: 'desktop', attachmentId: desktop.id, sha256: hash.repeat(64), viewport: { width: 1280, height: 720 }, width: 1280, height: 2000 }] },
  ];
  await ingestEvents(
    tenant.tokenProject,
    run,
    eventBatch([testBegin({ seq: 0, testKey: key, title: 'places an order', file: 'tests/checkout.spec.ts' }), attemptEnd({ seq: 1, testKey: key, startedAt: startedAt.toISOString(), attachments: [desktop], checkpoints })]),
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

  test('finds open feedback across runs, by state and by view', async ({ tenant }) => {
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    await reviewRun(tenant, { branch: 'main' }, 'a', new Date(Date.now() - 60 * 60_000));
    const [flow] = await libraryFlows(tenant.project.id, { kind: 'branch', branch: 'main' });
    const commented = flow.checkpoints[0].captures[0];
    await createThread({ projectId: tenant.project.id, captureId: commented.id, anchor: { kind: 'point', x: 0.5, y: 0.1 }, body: 'The total should be bold', author: { userId: tenant.adminUser.id, source: 'app' } });
    await createLibraryView({ projectId: tenant.project.id, userId: tenant.adminUser.id, name: 'Mine to check', config: { filters: { states: ['verify'] } } });
    const reader = await mcpClient({ token: (await createPat(tenant.adminUser)).token });

    // Still on the pixels commented on: waiting for a change.
    const waiting = await call(reader, 'get_library_flows', { project, view: 'to-fix' });
    expect(waiting.structuredContent).toMatchObject({ total: 1, flows: [{ state: 'waiting', openComments: 1, checkpoints: [{ captures: [{ states: ['waiting'], openThreads: 1, outdatedThreads: 0 }] }] }] });
    expect((await call(reader, 'list_review_threads', { project, library: true, placement: 'outdated' })).structuredContent).toMatchObject({ counts: { open: 1, outdated: 0 }, images: [] });

    // A later run changed the screen: ready to verify, and the thread says which version it was about.
    const fixed = await reviewRun(tenant, { branch: 'main' }, 'b');
    const verify = await call(reader, 'get_library_flows', { project, state: ['verify'] });
    expect(verify.structuredContent).toMatchObject({ total: 1, flows: [{ run: fixed, state: 'verify', checkpoints: [{ captures: [{ states: ['verify', 'updated'], outdatedThreads: 1 }] }] }] });
    expect((await call(reader, 'get_library_flows', { project, view: 'to-fix' })).structuredContent).toMatchObject({ total: 0 });
    expect((await call(reader, 'get_library_flows', { project, view: 'mine to check' })).structuredContent).toMatchObject({ total: 1, view: expect.stringContaining('Mine to check') });
    expect((await call(reader, 'get_library_flows', { project, view: 'nobody’s' })).isError).toBe(true);

    const threads = await call(reader, 'list_review_threads', { project, library: true, placement: 'outdated' });
    expect(threads.structuredContent).toMatchObject({
      reference: 'branch:main',
      run: fixed,
      counts: { open: 1, outdated: 1 },
      images: [{ run: fixed, threads: [{ number: 1, status: 'open', placement: 'outdated', placedOnCapture: commented.id }] }],
    });
    expect(String((threads.structuredContent as { images: { threads: { url: string }[] }[] }).images[0].threads[0].url)).toMatch(/\/library\?ref=branch%3Amain&cp=.+&v=desktop&thread=1$/);
    await reader.close();
  });
});
