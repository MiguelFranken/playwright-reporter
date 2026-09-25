/**
 * Where the app serves Playwright's Trace Viewer (copied from playwright-core
 * by scripts/copy-trace-viewer.mjs). `index.html` is spelled out: the viewer
 * loads its assets and service worker by relative path, and Next.js would
 * redirect `/trace/` to `/trace`, which resolves them against `/`.
 */
export const TRACE_VIEWER_PATH = '/trace/index.html';

/**
 * A link that opens `traceUrl` in the self-hosted viewer. The viewer's service
 * worker fetches the trace same-origin, so a plain `/api/artifacts/…` path is
 * authorized by the session cookie; links for callers without one (MCP) pass
 * an absolute, signed artifact URL and the app's origin.
 */
export function traceViewerUrl(traceUrl: string, origin = '') {
  return `${origin}${TRACE_VIEWER_PATH}?trace=${encodeURIComponent(traceUrl)}`;
}
