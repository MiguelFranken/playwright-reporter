import { defineConfig } from 'tsdown';

/**
 * The typed ingest client: oRPC and what it is built on. Inlined because the
 * packages are ESM-only (the CJS build must load on Node 18) and pinned betas
 * a consuming project should not have to resolve.
 */
const ORPC = [/^@orpc\//, /^@standard-server\//, /^@openapi-spec\//, 'rou3', 'cookie'];

export default defineConfig({
  entry: { index: './src/index.ts', types: './src/types.ts', client: './src/client.ts' },
  format: ['esm', 'cjs'],
  platform: 'node',
  target: 'node18',
  dts: true,
  clean: true,
  sourcemap: true,
  deps: {
    // Playwright is a peer dependency supplied by the consuming project.
    neverBundle: ['@playwright/test'],
    // @miguelfranken/protocol is private to this repo, so it has to be inlined. Its zod
    // import stays external: zod is a declared dependency here, so consumers
    // resolve it from node_modules instead of carrying a second copy in dist.
    alwaysBundle: ['@miguelfranken/protocol', ...ORPC],
  },
});
