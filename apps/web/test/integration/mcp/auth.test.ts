/**
 * The endpoint's front door: kill switch, DNS-rebinding guard and bearer auth,
 * checked at the HTTP level; then a full handshake with the real SDK client
 * on both protocol generations.
 */
import { eq } from 'drizzle-orm';
import { personalAccessTokens, users } from '@/lib/db/schema';
import { saveMcpSetting } from '@/lib/mcp/instance';
import { createUserRow, describe, expect, test } from '../fixtures';
import { ERAS, createPat, initializeBody, mcpClient, rawPost } from './client';

describe('bearer authentication', () => {
  test('rejects a request without a token with 401 and a challenge', async ({ db }) => {
    void db;
    const response = await rawPost(initializeBody);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toMatch(/^Bearer /);
  });

  test.for([
    { name: 'an unknown token', token: 'pwr_pat_nope', message: /invalid, expired or revoked/ },
    { name: 'a project ingest token', token: 'pwr_abcdef', message: /project ingest token/ },
    { name: 'a token of another format', token: 'ghp_something', message: /Unknown token/ },
  ])('rejects $name with a description', async ({ token, message }, { db }) => {
    void db;
    const response = await rawPost(initializeBody, { authorization: `Bearer ${token}` });
    expect(response.status).toBe(401);
    expect(decodeURIComponent(response.headers.get('www-authenticate') ?? '')).toMatch(message);
  });

  test('rejects expired and revoked tokens and tokens of banned users', async ({ db, tenant }) => {
    const expired = await createPat(tenant.adminUser, { expiresAt: new Date(Date.now() - 1000) });
    expect((await rawPost(initializeBody, { authorization: `Bearer ${expired.token}` })).status).toBe(401);

    const revoked = await createPat(tenant.adminUser);
    await db.update(personalAccessTokens).set({ revokedAt: new Date() }).where(eq(personalAccessTokens.id, revoked.id));
    expect((await rawPost(initializeBody, { authorization: `Bearer ${revoked.token}` })).status).toBe(401);

    const valid = await createPat(tenant.adminUser);
    await db.update(users).set({ banned: true }).where(eq(users.id, tenant.adminUser.id));
    expect((await rawPost(initializeBody, { authorization: `Bearer ${valid.token}` })).status).toBe(401);
  });

  test('refuses a foreign Host header before looking at the token', async ({ db, tenant }) => {
    void db;
    const { token } = await createPat(tenant.adminUser);
    const response = await rawPost(initializeBody, { authorization: `Bearer ${token}`, host: 'evil.example' });
    expect(response.status).toBe(403);
  });

  test('refuses a browser Origin that is not the app', async ({ db, tenant }) => {
    void db;
    const { token } = await createPat(tenant.adminUser);
    const response = await rawPost(initializeBody, { authorization: `Bearer ${token}`, origin: 'https://evil.example' });
    expect(response.status).toBe(403);
  });

  test('answers 404 while a superadmin has switched the server off', async ({ db, tenant }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    await saveMcpSetting({ enabled: false }, root.id);
    const { token } = await createPat(tenant.adminUser);
    expect((await rawPost(initializeBody, { authorization: `Bearer ${token}` })).status).toBe(404);
    await saveMcpSetting({ enabled: true }, root.id);
    expect((await rawPost(initializeBody, { authorization: `Bearer ${token}` })).status).toBe(200);
  });

  test('records when a token was last used', async ({ db, tenant }) => {
    const { token, id } = await createPat(tenant.adminUser);
    await rawPost(initializeBody, { authorization: `Bearer ${token}` });
    await new Promise((r) => setTimeout(r, 50));
    const [row] = await db.select().from(personalAccessTokens).where(eq(personalAccessTokens.id, id));
    expect(row.lastUsedAt).toBeInstanceOf(Date);
  });
});

describe.each(ERAS)('handshake on the %s protocol generation', (era) => {
  test('lists the core and debug tools, the guide and server instructions', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser);
    const client = await mcpClient({ token, era });
    expect(client.getNegotiatedProtocolVersion()).toBe(era === 'modern' ? '2026-07-28' : '2025-11-25');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['whoami', 'list_runs', 'get_run', 'find_tests', 'project_health']));
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.outputSchema).toBeTruthy();
      expect(Object.keys((tool.inputSchema as { properties?: object }).properties ?? {}).length > 0 || tool.name === 'whoami').toBe(true);
    }
    expect(client.getInstructions()).toContain('untrusted');
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('pwr://guide');
    await client.close();
  });

  test('narrows the tool list with ?toolsets=', async ({ tenant }) => {
    const { token } = await createPat(tenant.adminUser);
    const client = await mcpClient({ token, era, query: '?toolsets=core' });
    const { tools } = await client.listTools();
    expect(tools.every((t) => !['get_failure_context', 'verify_fix'].includes(t.name))).toBe(true);
    await client.close();
  });
});
