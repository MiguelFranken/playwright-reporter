import { NextRequest } from 'next/server';
import { getRedirectUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getCookieCache } = vi.hoisted(() => ({ getSession: vi.fn(), getCookieCache: vi.fn() }));
vi.mock('@/lib/auth/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('better-auth/cookies', async (original) => ({ ...(await original<typeof import('better-auth/cookies')>()), getCookieCache }));

import { config, proxy } from './proxy';

// The proxy docs name this `unstable_doesProxyMatch`; 16.3 still ships the old name.
const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe('proxy matcher', () => {
  it.each([
    '/api/ingest/runs',
    '/api/ingest/runs/abc/events',
    '/api/teams/acme/projects/web/live',
    '/api/mcp',
    '/api/auth/get-session',
    '/_next/static/chunks/app.js',
    '/_next/image',
    '/_vercel/speed-insights/script.js',
    '/_vercel/speed-insights/vitals',
    '/.well-known/workflow/v1/flow',
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-authorization-server/api/auth',
    '/favicon.ico',
    '/push-sw.js',
    '/trace/index.html',
    '/trace/sw.bundle.js',
  ])('skips %s', (url) => {
    expect(matches(url)).toBe(false);
  });

  it.each(['/', '/login', '/demo', '/teams/acme/projects/web/runs', '/apiary', '/push-sw.jsx', '/traces'])('runs on %s', (url) => {
    expect(matches(url)).toBe(true);
  });
});

describe('proxy', () => {
  beforeEach(() => {
    // Without one, `authSecret()` warns, and the console Next.js patches for its testing helpers throws outside a request.
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
    getSession.mockReset();
    getCookieCache.mockReset().mockResolvedValue(null);
  });

  const withCookie = (cookie = 'pwr.session_token=abc') => new NextRequest('https://app.test/admin', { headers: { cookie } });

  it('sends a signed-out visitor to /login and remembers where they were going', async () => {
    const response = await proxy(new NextRequest('https://app.test/teams/acme/projects/web/runs?status=failed'));
    const redirect = new URL(getRedirectUrl(response) ?? '');
    expect(redirect.pathname).toBe('/login');
    expect(redirect.searchParams.get('next')).toBe('/teams/acme/projects/web/runs?status=failed');
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each(['/login', '/invite/abc', '/demo'])('lets a signed-out visitor open %s', async (path) => {
    expect(getRedirectUrl(await proxy(new NextRequest(`https://app.test${path}`)))).toBeNull();
  });

  it('lets a valid cookie cache through without reading the session', async () => {
    getCookieCache.mockResolvedValue({ session: {}, user: {} });
    expect(getRedirectUrl(await proxy(withCookie()))).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('reads the session once the cookie cache has lapsed, and passes the refreshed cookies on', async () => {
    getSession.mockResolvedValue({ response: { session: {}, user: {} }, headers: new Headers({ 'set-cookie': 'pwr.session_data=fresh; Path=/' }) });
    const response = await proxy(withCookie());
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.getSetCookie()).toContain('pwr.session_data=fresh; Path=/');
  });

  it('sends a visitor whose session expired to /login before the page renders, and clears the stale cookie', async () => {
    getSession.mockResolvedValue({ response: null, headers: new Headers() });
    const response = await proxy(withCookie('__Secure-pwr.session_token=stale'));
    expect(new URL(getRedirectUrl(response) ?? '').searchParams.get('next')).toBe('/admin');
    const cleared = response.headers.getSetCookie().find((c) => c.startsWith('__Secure-pwr.session_token='));
    expect(cleared).toMatch(/Max-Age=0/);
    expect(cleared).toMatch(/Secure/);
  });
});
