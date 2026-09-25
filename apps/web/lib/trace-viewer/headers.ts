import { traceViewerInlineScriptHashes } from './source.mjs';

/**
 * Response headers for the self-hosted Trace Viewer (`/trace/*`). The viewer
 * renders recorded pages from untrusted test runs on the app's own origin, so
 * it gets a CSP of its own on top of the one Playwright puts on every snapshot:
 * no script but its own files, no network but this origin (the service worker
 * inherits this policy, so it cannot fetch a trace from anywhere else), and no
 * framing outside the app.
 */
export function traceViewerHeaders() {
  const csp = [
    "default-src 'self'",
    ["script-src 'self'", ...traceViewerInlineScriptHashes()].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
  ];
}
