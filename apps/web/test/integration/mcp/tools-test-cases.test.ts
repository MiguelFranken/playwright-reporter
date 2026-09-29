/**
 * The test case tools end to end: read with a read-only token, write only
 * with a write-scoped one, and never past the caller's role.
 */
import { playRun } from '../factories';
import { createMember, describe, expect, test } from '../fixtures';
import { call, createPat, mcpClient } from './client';

describe('test case tools', () => {
  test('read-only tokens see the read tools only', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser);
    const client = await mcpClient({ token });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_test_cases', 'get_test_case', 'list_test_suites']));
    expect(names).not.toContain('create_test_case');
    await client.close();
  });

  test('a write token creates, links, adopts and edits cases', async ({ tenant }) => {
    await playRun(tenant.tokenProject, {
      tests: [
        { title: 'logs in', file: 'tests/login.spec.ts', outcome: 'passed' },
        { title: 'adds to cart', file: 'tests/cart.spec.ts', outcome: 'failed', steps: ['Open the shop', 'Add an item'] },
      ],
    });
    const { token } = await createPat(tenant.adminUser, { scopes: ['read', 'write'] });
    const client = await mcpClient({ token });
    const project = `${tenant.team.slug}/${tenant.project.slug}`;

    const created = await call(client, 'create_test_case', {
      project,
      title: 'Log in with valid credentials',
      suite: 'Accounts / Login',
      priority: 'high',
      steps: [{ action: 'Open the login page', expected: 'The form shows' }],
    });
    expect(created.isError).toBeFalsy();
    expect(created.structuredContent).toMatchObject({ key: 'TC-1', version: 1 });

    const suites = await call(client, 'list_test_suites', { project });
    expect(suites.structuredContent).toMatchObject({ suites: [{ path: 'Accounts' }, { path: 'Accounts / Login', cases: 1 }] });

    const tests = await call(client, 'find_tests', { project, search: 'logs in', minRuns: 1 });
    const testId = (tests.structuredContent!.tests as { testId: string }[])[0].testId;
    const linked = await call(client, 'link_test_case', { project, case: 'TC-1', link: [testId] });
    expect(linked.structuredContent).toMatchObject({ linked: 1 });

    const cart = await call(client, 'find_tests', { project, search: 'adds to cart', minRuns: 1 });
    const adopted = await call(client, 'adopt_tests', { project, tests: [(cart.structuredContent!.tests as { testId: string }[])[0].testId] });
    expect(adopted.structuredContent).toMatchObject({ created: [{ key: 'TC-2' }], skipped: 0 });

    const edited = await call(client, 'update_test_case', { project, case: 'TC-1', addTags: ['smoke'], status: 'draft', expectedVersion: 2 });
    expect(edited.isError).toBeFalsy();
    const stale = await call(client, 'update_test_case', { project, case: 'TC-1', title: 'x', expectedVersion: 1 });
    expect(stale.isError).toBe(true);

    const detail = await call(client, 'get_test_case', { project, case: 'TC-1' });
    expect(detail.structuredContent).toMatchObject({
      key: 'TC-1',
      suite: 'Accounts / Login',
      status: 'draft',
      tags: ['smoke'],
      automation: 'automated',
      verdict: 'passing',
      linkedTests: [{ title: 'logs in', linkedFrom: 'manual', lastOutcome: 'passed' }],
    });

    const failing = await call(client, 'list_test_cases', { project, verdict: 'failing' });
    expect(failing.structuredContent).toMatchObject({ total: 1, cases: [{ key: 'TC-2', title: 'adds to cart', suite: 'cart' }] });
    await client.close();
  });

  test('a write token deletes empty suites and refuses ones with cases', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser, { scopes: ['read', 'write'] });
    const client = await mcpClient({ token });
    const project = `${tenant.team.slug}/${tenant.project.slug}`;
    await call(client, 'create_test_case', { project, title: 'Pay by card', suite: 'Checkout / Payments' });
    await call(client, 'create_test_suite', { project, name: 'old-file' });
    await call(client, 'create_test_suite', { project, name: 'describe block', parent: 'old-file' });

    expect((await call(client, 'delete_test_suite', { project })).isError).toBe(true);
    expect((await call(client, 'delete_test_suite', { project, suites: ['Checkout'] })).isError).toBe(true);
    const swept = await call(client, 'delete_test_suite', { project, allEmpty: true });
    expect(swept.structuredContent).toMatchObject({ deleted: ['old-file', 'old-file / describe block'] });

    const suites = await call(client, 'list_test_suites', { project });
    expect(suites.structuredContent).toMatchObject({ suites: [{ path: 'Checkout' }, { path: 'Checkout / Payments', cases: 1 }] });
    await client.close();
  });

  test('a write token of a viewer cannot write', async ({ db, tenant }) => {
    const viewer = await createMember(db, tenant.team.id, 'viewer');
    const { token } = await createPat(viewer, { scopes: ['read', 'write'] });
    const client = await mcpClient({ token });
    const result = await call(client, 'create_test_case', { project: `${tenant.team.slug}/${tenant.project.slug}`, title: 'Nope' });
    expect(result.isError).toBe(true);
    await client.close();
  });
});
