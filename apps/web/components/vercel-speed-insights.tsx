'use client';

import { lazy, Suspense } from 'react';

// `next.config.ts` inlines this at build time: '1' when the build runs on
// Vercel, '' anywhere else. On a self-hosted build the condition is a constant
// false, so the bundler drops the `import()` with it: no Speed Insights code
// in any chunk, and no request for `/_vercel/speed-insights/script.js`. On
// Vercel the component loads as its own chunk, after the page.
const SpeedInsights = process.env.VERCEL_SPEED_INSIGHTS
  ? lazy(() => import('@vercel/speed-insights/next').then((m) => ({ default: m.SpeedInsights })))
  : null;

/** Vercel Speed Insights, only in a build made on Vercel. */
export function VercelSpeedInsights() {
  if (!SpeedInsights) return null;
  return (
    <Suspense>
      <SpeedInsights />
    </Suspense>
  );
}
