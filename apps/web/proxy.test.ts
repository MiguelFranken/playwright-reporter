import { NextRequest } from 'next/server';
import { getRedirectUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
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
  it('sends a signed-out visitor to /login and remembers where they were going', () => {
    const response = proxy(new NextRequest('https://app.test/teams/acme/projects/web/runs?status=failed'));
    const redirect = new URL(getRedirectUrl(response) ?? '');
    expect(redirect.pathname).toBe('/login');
    expect(redirect.searchParams.get('next')).toBe('/teams/acme/projects/web/runs?status=failed');
  });

  it.each(['/login', '/invite/abc', '/demo'])('lets a signed-out visitor open %s', (path) => {
    expect(getRedirectUrl(proxy(new NextRequest(`https://app.test${path}`)))).toBeNull();
  });

  it('lets a visitor with a session cookie through', () => {
    const request = new NextRequest('https://app.test/teams/acme', {
      headers: { cookie: 'pwr.session_token=abc' },
    });
    expect(getRedirectUrl(proxy(request))).toBeNull();
  });
});
