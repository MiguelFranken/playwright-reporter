import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';
import { DEVICE_WIDTHS, IMAGE_WIDTHS_SMALL } from './lib/artifacts/image-variants';
import { traceViewerHeaders } from './lib/trace-viewer/headers';

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: {
    // Vercel sets VERCEL=1 during its builds. Inlined so that a self-hosted
    // build drops Vercel Speed Insights entirely (components/vercel-speed-insights).
    VERCEL_SPEED_INSIGHTS: process.env.VERCEL ? '1' : '',
  },
  // A <Link> prefetches one App Shell per route, shared by every link to it,
  // instead of one prefetch per link on screen: a run page lists hundreds of
  // result links to the same route. What depends on the URL streams in after
  // the click, behind the pages' Suspense boundaries, as it already did.
  partialPrefetching: true,
  images: {
    // The widths a screenshot is offered in (its `srcset`): exactly the copies the image route makes and keeps.
    deviceSizes: [...DEVICE_WIDTHS],
    imageSizes: [...IMAGE_WIDTHS_SMALL],
  },
  experimental: {
    // Going back to a page seen in the last 30 seconds reuses its render
    // instead of asking the server again. Nothing is stale for long: a Server
    // Action that revalidates clears this cache, and the live views (runs,
    // run pages) follow their event stream from the cursor they rendered at.
    staleTimes: { dynamic: 30 },
    // Importing test cases posts the file to a Server Action. Vercel caps a
    // request body at 4.5 MB, so 4 MB leaves room for the multipart framing.
    serverActions: { bodySizeLimit: '4mb' },
  },
  async redirects() {
    // The visual review's approved screens became the library; the query (a search, a folder) carries over.
    return [{ source: '/teams/:team/projects/:project/review/screens', destination: '/teams/:team/projects/:project/library', permanent: true }];
  },
  async headers() {
    // Playwright's Trace Viewer, served from public/trace (lib/trace-viewer).
    return [{ source: '/trace/:path*', headers: traceViewerHeaders() }];
  },
};

// Compiles the `"use workflow"` / `"use step"` directives (the run watchdog,
// `lib/runs/watchdog`) and serves the runtime under `/.well-known/workflow/`.
export default withWorkflow(nextConfig);
