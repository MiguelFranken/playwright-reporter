import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';
import { traceViewerHeaders } from './lib/trace-viewer/headers';

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    // Playwright's Trace Viewer, served from public/trace (lib/trace-viewer).
    return [{ source: '/trace/:path*', headers: traceViewerHeaders() }];
  },
};

// Compiles the `"use workflow"` / `"use step"` directives (the run watchdog,
// `lib/runs/watchdog`) and serves the runtime under `/.well-known/workflow/`.
export default withWorkflow(nextConfig);
