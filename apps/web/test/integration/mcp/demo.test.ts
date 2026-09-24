/**
 * The shared demo account (DEMO_USER_EMAIL) is used by every visitor at once.
 * A token or OAuth grant would outlive a visit and hand lasting access to
 * whoever minted it, so the demo account can do neither — and a credential
 * that already exists for it is refused by the MCP endpoint.
 */
import { createPersonalToken } from '@/app/(app)/account/token-actions';
import { approveConnection } from '@/app/connect/mcp/actions';
import { DEMO_READ_ONLY } from '@/lib/auth/demo';
import { createMember, describe, expect, test, vi } from '../fixtures';
import { createPat, initializeBody, rawPost } from './client';

const DEMO_EMAIL = 'demo@example.test';

describe('the demo account and MCP', () => {
  test('cannot mint a personal access token', async ({ db, tenant, actor }) => {
    vi.stubEnv('DEMO_USER_EMAIL', DEMO_EMAIL);
    const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });
    actor.signIn(demo);
    expect(await createPersonalToken({ name: 'x', expiresInDays: 30, restriction: { kind: 'all' } })).toEqual({ ok: false, message: DEMO_READ_ONLY });
    vi.unstubAllEnvs();
  });

  test('cannot approve an OAuth connection', async ({ db, tenant, actor }) => {
    vi.stubEnv('DEMO_USER_EMAIL', DEMO_EMAIL);
    const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });
    actor.signIn(demo);
    const form = new FormData();
    form.set('request', 'response_type=code&client_id=x');
    form.set('access', 'all');
    expect(await approveConnection(form)).toEqual({ ok: false, message: DEMO_READ_ONLY });
    vi.unstubAllEnvs();
  });

  test('an existing token of the demo account is refused', async ({ db, tenant }) => {
    const demo = await createMember(db, tenant.team.id, 'viewer', { email: DEMO_EMAIL });
    const { token } = await createPat(demo);
    vi.stubEnv('DEMO_USER_EMAIL', DEMO_EMAIL);
    const response = await rawPost(initializeBody, { authorization: `Bearer ${token}` });
    expect(response.status).toBe(401);
    expect(decodeURIComponent(response.headers.get('www-authenticate') ?? '')).toContain('demo account');
    vi.unstubAllEnvs();
  });
});
