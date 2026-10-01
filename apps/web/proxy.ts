import { getCookieCache, getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { authSecret, COOKIE_PREFIX } from '@/lib/auth/config';

/**
 * Sends visitors without a session to `/login` before a page renders. This is
 * *not* the security boundary: every page, action and route handler re-checks
 * through `lib/auth/access.ts`. It is what keeps a page from streaming a shell
 * whose Suspense boundaries then each redirect to `/login`, which shows as a
 * flash of an error page before the browser follows the redirect.
 *
 * A session cookie alone does not say the session is still there: it outlives
 * an expired or revoked one. The signed cookie cache (`session_data`, five
 * minutes) does, and costs no query; once it has lapsed, the session is read
 * once and the refreshed cookie cache goes back with the response.
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

/** The cookies a stale session leaves behind, with and without the `__Secure-` prefix. */
const SESSION_COOKIES = ['session_token', 'session_data'].flatMap((name) => [`${COOKIE_PREFIX}.${name}`, `__Secure-${COOKIE_PREFIX}.${name}`]);

function toLogin(request: NextRequest) {
  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (!getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX })) return toLogin(request);
  if (await getCookieCache(request, { cookiePrefix: COOKIE_PREFIX, secret: authSecret() })) return NextResponse.next();

  const { headers, response: session } = await auth.api.getSession({ headers: request.headers, returnHeaders: true });
  if (!session) {
    const response = toLogin(request);
    // A `__Secure-` cookie is only replaced by one that is `Secure` as well.
    for (const name of SESSION_COOKIES) {
      if (request.cookies.has(name)) response.cookies.set(name, '', { path: '/', maxAge: 0, secure: name.startsWith('__Secure-') });
    }
    return response;
  }
  const response = NextResponse.next();
  for (const cookie of headers.getSetCookie()) response.headers.append('set-cookie', cookie);
  return response;
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
 * - `_vercel/`: the platform's own endpoints, such as Speed Insights' script
 *   and the vitals it reports from pages a visitor may not be signed in to.
 * - `trace/`: Playwright's Trace Viewer (lib/trace-viewer), static files and a
 *   service worker with no data of their own; /api/artifacts authorizes the trace.
 *
 * Must stay a literal: Next.js reads it statically at build time.
 */
export const config = {
  matcher: ['/((?!api/|_next/|_vercel/|\\.well-known/workflow/|\\.well-known/oauth-|favicon|push-sw\\.js$|trace/).*)'],
};
