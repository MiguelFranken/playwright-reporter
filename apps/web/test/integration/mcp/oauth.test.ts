/**
 * The OAuth authorization server behind MCP connectors, end to end: discovery,
 * registration, consent (the Server Action), the PKCE code exchange, refresh
 * rotation with reuse detection, revocation — and the MCP endpoint accepting
 * the resulting access token with the consented restrictions.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { GET as protectedResource } from '@/app/.well-known/oauth-protected-resource/[[...path]]/route';
import { GET as authorizationServer } from '@/app/.well-known/oauth-authorization-server/route';
import { approveConnection, denyConnection } from '@/app/connect/mcp/actions';
import { revokeConnectedApp } from '@/app/(app)/account/oauth-actions';
import { POST as register } from '@/app/api/oauth/register/route';
import { POST as revoke } from '@/app/api/oauth/revoke/route';
import { POST as token } from '@/app/api/oauth/token/route';
import { auditLogs, oauthGrants, projects } from '@/lib/db/schema';
import { createTenant, describe, expect, test, vi, type Tenant } from '../fixtures';
import { call, initializeBody, mcpClient, rawPost, text } from './client';

const REDIRECT = 'https://client.example/callback';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function registerClient(body: Record<string, unknown> = {}) {
  const response = await register(
    new Request('http://test.local/api/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Test Assistant', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', ...body }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, string> };
}

/** Runs a Server Action that ends in `redirect()` and returns where it pointed. */
async function redirectOf(action: () => Promise<unknown>): Promise<URL> {
  try {
    const result = await action();
    throw new Error(`expected a redirect, got ${JSON.stringify(result)}`);
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (typeof digest !== 'string' || !digest.startsWith('NEXT_REDIRECT')) throw error;
    return new URL(digest.split(';')[2]);
  }
}

function consentForm(query: Record<string, string>, access = 'all') {
  const form = new FormData();
  form.set('request', new URLSearchParams(query).toString());
  form.set('access', access);
  return form;
}

function tokenRequest(params: Record<string, string>) {
  return token(
    new Request('http://test.local/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    }),
  );
}

/** Registration → consent → code exchange. Returns the token response. */
async function authorize(tenant: Tenant, actor: { signIn: (u: Tenant['adminUser']) => void }, access = 'all') {
  const { body: client } = await registerClient();
  const { verifier, challenge } = pkce();
  actor.signIn(tenant.adminUser);
  const query = {
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'read',
    resource: 'http://test.local/api/mcp',
  };
  const back = await redirectOf(() => approveConnection(consentForm(query, access)));
  expect(back.origin + back.pathname).toBe(REDIRECT);
  expect(back.searchParams.get('state')).toBe('xyz');
  expect(back.searchParams.get('iss')).toBe('http://test.local');
  const response = await tokenRequest({
    grant_type: 'authorization_code',
    code: back.searchParams.get('code')!,
    redirect_uri: REDIRECT,
    client_id: client.client_id,
    code_verifier: verifier,
    resource: 'http://test.local/api/mcp',
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return { client, tokens: (await response.json()) as { access_token: string; refresh_token: string; expires_in: number; token_type: string; scope: string } };
}

describe('discovery', () => {
  test('the MCP endpoint points unauthenticated clients at the protected-resource metadata', async ({ db }) => {
    void db;
    const response = await rawPost(initializeBody);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata="http://test.local/.well-known/oauth-protected-resource/api/mcp"');
  });

  test('serves RFC 9728 and RFC 8414 documents', async () => {
    const prm = await protectedResource(new Request('http://test.local/.well-known/oauth-protected-resource/api/mcp'));
    expect(prm.status).toBe(200);
    expect(await prm.json()).toMatchObject({ resource: 'http://test.local/api/mcp', authorization_servers: [expect.stringMatching(/^http:\/\/test\.local\/?$/)] });

    const as = await authorizationServer(new Request('http://test.local/.well-known/oauth-authorization-server'));
    expect(as.status).toBe(200);
    expect(await as.json()).toMatchObject({
      issuer: 'http://test.local',
      authorization_endpoint: 'http://test.local/connect/mcp',
      token_endpoint: 'http://test.local/api/oauth/token',
      registration_endpoint: 'http://test.local/api/oauth/register',
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: true,
    });
  });
});

describe('registration', () => {
  test('registers a public client and refuses unsafe redirect URIs', async ({ db }) => {
    void db;
    const ok = await registerClient();
    expect(ok.status).toBe(201);
    expect(ok.body.client_id).toMatch(/^pwr_client_/);
    expect(ok.body.client_secret).toBeUndefined();

    expect((await registerClient({ redirect_uris: ['http://evil.example/cb'] })).status).toBe(400);
    expect((await registerClient({ redirect_uris: ['javascript:alert(1)'] })).status).toBe(400);
    expect((await registerClient({ redirect_uris: ['http://127.0.0.1:33418/callback', 'cursor://anysphere.cursor-mcp/oauth/callback'] })).status).toBe(201);
  });

  test('a confidential client must authenticate at the token endpoint', async ({ db }) => {
    void db;
    const { body } = await registerClient({ token_endpoint_auth_method: 'client_secret_post' });
    expect(body.client_secret).toMatch(/^pwr_cs_/);
    const response = await tokenRequest({ grant_type: 'authorization_code', code: 'x', client_id: body.client_id, code_verifier: 'a'.repeat(43) });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('invalid_client');
  });
});

describe('authorization code flow', () => {
  test('issues tokens the MCP endpoint accepts as the consenting user', async ({ tenant, actor }) => {
    const { tokens } = await authorize(tenant, actor);
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'read' });
    expect(tokens.access_token).toMatch(/^pwr_oat_/);
    expect(tokens.refresh_token).toMatch(/^pwr_ort_/);

    const client = await mcpClient({ token: tokens.access_token });
    const whoami = await call(client, 'whoami');
    expect(whoami.structuredContent).toMatchObject({ user: { email: tenant.adminUser.email }, credential: { kind: 'oauth', name: 'Test Assistant' } });
  });

  test('carries a project restriction from the consent screen into every call', async ({ db, tenant, actor }) => {
    const [second] = await db.insert(projects).values({ id: crypto.randomUUID(), teamId: tenant.team.id, slug: 'second', name: 'Second' }).returning();
    const { tokens } = await authorize(tenant, actor, `project:${second.id}`);
    const client = await mcpClient({ token: tokens.access_token });
    const whoami = (await call(client, 'whoami')).structuredContent as { teams: { projects: { ref: string }[] }[]; defaultProject: { resolvedBy: string } };
    expect(whoami.teams.flatMap((t) => t.projects.map((p) => p.ref))).toEqual([`${tenant.team.slug}/second`]);
    expect(whoami.defaultProject.resolvedBy).toBe('token');
    const denied = await call(client, 'list_runs', { project: `${tenant.team.slug}/${tenant.project.slug}` });
    expect(denied.structuredContent?.error).toMatchObject({ code: 'NOT_FOUND' });
  });

  test('refuses a wrong code_verifier and a replayed code (which revokes the grant)', async ({ db, tenant, actor }) => {
    const { body: client } = await registerClient();
    const { verifier, challenge } = pkce();
    actor.signIn(tenant.adminUser);
    const query = { response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' };
    const code = (await redirectOf(() => approveConnection(consentForm(query)))).searchParams.get('code')!;

    const wrong = await tokenRequest({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: pkce().verifier, redirect_uri: REDIRECT });
    expect((await wrong.json()).error).toBe('invalid_grant');

    const ok = await tokenRequest({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: verifier, redirect_uri: REDIRECT });
    const { access_token } = await ok.json();
    const replay = await tokenRequest({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: verifier, redirect_uri: REDIRECT });
    expect((await replay.json()).error).toBe('invalid_grant');
    expect((await rawPost(initializeBody, { authorization: `Bearer ${access_token}` })).status).toBe(401);
    const [grant] = await db.select().from(oauthGrants);
    expect(grant.revokedAt).toBeInstanceOf(Date);
  });

  test('rotates refresh tokens and revokes the grant when a rotated one comes back', async ({ tenant, actor }) => {
    const { client, tokens } = await authorize(tenant, actor);
    const refreshed = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id });
    const next = await refreshed.json();
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect((await rawPost(initializeBody, { authorization: `Bearer ${next.access_token}` })).status).toBe(200);

    const reuse = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id });
    expect((await reuse.json()).error).toBe('invalid_grant');
    expect((await rawPost(initializeBody, { authorization: `Bearer ${next.access_token}` })).status).toBe(401);
  });

  test('the revocation endpoint ends a grant through its refresh token', async ({ tenant, actor }) => {
    const { client, tokens } = await authorize(tenant, actor);
    const response = await revoke(
      new Request('http://test.local/api/oauth/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokens.refresh_token, client_id: client.client_id }).toString(),
      }),
    );
    expect(response.status).toBe(200);
    expect((await rawPost(initializeBody, { authorization: `Bearer ${tokens.access_token}` })).status).toBe(401);
  });

  test('disconnecting from the account page stops the app, and is audited', async ({ db, tenant, actor }) => {
    const { tokens } = await authorize(tenant, actor);
    const [grant] = await db.select().from(oauthGrants);
    expect(await revokeConnectedApp(grant.id)).toEqual({ ok: true });
    expect((await rawPost(initializeBody, { authorization: `Bearer ${tokens.access_token}` })).status).toBe(401);
    const actions = (await db.select({ action: auditLogs.action }).from(auditLogs)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['oauth.grant', 'oauth.revoke']));
  });

  test('another user cannot disconnect somebody’s app', async ({ db, tenant, actor }) => {
    await authorize(tenant, actor);
    const [grant] = await db.select().from(oauthGrants);
    const other = await createTenant(db);
    actor.signIn(other.adminUser);
    expect((await revokeConnectedApp(grant.id)).ok).toBe(false);
  });
});

describe('consent validation', () => {
  test('denying sends the user back with access_denied', async ({ tenant, actor }) => {
    const { body: client } = await registerClient();
    actor.signIn(tenant.adminUser);
    const back = await redirectOf(() =>
      denyConnection(consentForm({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: 'S256', state: 's' })),
    );
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('state')).toBe('s');
  });

  test('never redirects to an unregistered URI, and requires PKCE S256', async ({ tenant, actor }) => {
    const { body: client } = await registerClient();
    actor.signIn(tenant.adminUser);
    const bad = await approveConnection(consentForm({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://evil.example/cb', code_challenge: pkce().challenge }));
    expect(bad).toMatchObject({ ok: false });

    const noPkce = await redirectOf(() => approveConnection(consentForm({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT })));
    expect(noPkce.searchParams.get('error')).toBe('invalid_request');
    const plain = await redirectOf(() =>
      approveConnection(consentForm({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: 'plain' })),
    );
    expect(plain.searchParams.get('error')).toBe('invalid_request');
    const otherResource = await redirectOf(() =>
      approveConnection(
        consentForm({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: 'S256', resource: 'https://other.example/mcp' }),
      ),
    );
    expect(otherResource.searchParams.get('error')).toBe('invalid_target');
  });

  test('accepts a Client ID Metadata Document instead of registration', async ({ db, tenant, actor }) => {
    const clientId = 'https://assistant.example/oauth/client.json';
    process.env.OAUTH_ALLOW_PRIVATE_CIMD = '1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) !== clientId) throw new Error(`unexpected fetch ${String(input)}`);
      return Response.json({ client_id: clientId, client_name: 'Metadata Assistant', redirect_uris: [REDIRECT] });
    });
    try {
      const { verifier, challenge } = pkce();
      actor.signIn(tenant.adminUser);
      const back = await redirectOf(() =>
        approveConnection(consentForm({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' })),
      );
      const response = await tokenRequest({ grant_type: 'authorization_code', code: back.searchParams.get('code')!, client_id: clientId, code_verifier: verifier });
      const { access_token } = await response.json();
      const client = await mcpClient({ token: access_token });
      expect(text(await call(client, 'whoami'))).toContain('Metadata Assistant');
      const [grant] = await db.select().from(oauthGrants).where(eq(oauthGrants.clientId, clientId));
      expect(grant).toBeTruthy();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.OAUTH_ALLOW_PRIVATE_CIMD;
    }
  });
});
