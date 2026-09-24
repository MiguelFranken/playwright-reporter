import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_PREFIX } from '@/lib/auth/config';

/**
 * Optimistic cookie check only — no database, no session validation. This is
 * *not* a security boundary: every page, action and route handler re-checks
 * through `lib/auth/access.ts`. Its job is to send signed-out visitors to
 * `/login` instead of rendering a shell they cannot use.
 */
const PUBLIC = [
  /^\/login$/,
  /^\/invite\//,
  // Signs visitors in as the read-only demo account (`lib/auth/demo.ts`).
  /^\/demo$/,
  // Every route handler authorizes itself — by ingest token, Better Auth
  // session, or a signed artifact URL — and answers with a status code.
  // Redirecting an API request to an HTML login page would only confuse the
  // caller (an `EventSource`, the reporter, or the trace viewer).
  /^\/api\//,
  // The Workflow SDK's queue calls these back (the run watchdog); a redirect
  // would break every watchdog in local dev and self-hosted.
  /^\/\.well-known\/workflow\//,
  // OAuth discovery for MCP clients: fetched by programs, never by a signed-in browser.
  /^\/\.well-known\/oauth-(authorization-server|protected-resource)(\/|$)/,
  /^\/_next\//,
  /^\/favicon/,
  // The push service worker: browsers fetch it without following redirects.
  /^\/push-sw\.js$/,
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (!getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX })) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
