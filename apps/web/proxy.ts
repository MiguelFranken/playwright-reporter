import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_PREFIX } from '@/lib/auth/config';

/**
 * Optimistic cookie check only — no database, no session validation. This is
 * *not* a security boundary: every page, action and route handler re-checks
 * through `lib/auth/access.ts`. Its job is to send signed-out visitors to
 * `/login` instead of rendering a shell they cannot use.
 *
 * Paths that never need the check are kept out by `config.matcher`, so the
 * proxy does not run for them at all; this list holds the public *pages*.
 */
const PUBLIC = [
  /^\/login$/,
  /^\/invite\//,
  // Signs visitors in as the read-only demo account (`lib/auth/demo.ts`).
  /^\/demo$/,
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

/**
 * Skipped entirely (the proxy is billed per invocation, and ingest traffic is
 * most of it):
 * - `api/`: every route handler authorizes itself — by ingest token, Better
 *   Auth session, or a signed artifact URL — and answers with a status code.
 *   Redirecting an API request to an HTML login page would only confuse the
 *   caller (an `EventSource`, the reporter, or the trace viewer).
 * - `.well-known/workflow/`: the Workflow SDK's queue calls these back (the run
 *   watchdog); a redirect would break every watchdog in local dev and self-hosted.
 * - `.well-known/oauth-`: OAuth discovery for MCP clients, fetched by programs.
 * - `_next/`, `favicon*`, and `push-sw.js` (browsers fetch the push service
 *   worker without following redirects).
 * - `trace/`: Playwright's Trace Viewer (lib/trace-viewer), static files and a
 *   service worker with no data of their own; /api/artifacts authorizes the trace.
 *
 * Must stay a literal: Next.js reads it statically at build time.
 */
export const config = {
  matcher: ['/((?!api/|_next/|\\.well-known/workflow/|\\.well-known/oauth-|favicon|push-sw\\.js$|trace/).*)'],
};
