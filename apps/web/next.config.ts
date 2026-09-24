import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

const nextConfig: NextConfig = {
  cacheComponents: true
};

// Compiles the `"use workflow"` / `"use step"` directives (the run watchdog,
// `lib/runs/watchdog`) and serves the runtime under `/.well-known/workflow/`.
export default withWorkflow(nextConfig);
