import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: './src/index.ts', types: './src/types.ts' },
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
    alwaysBundle: ['@miguelfranken/protocol'],
  },
});
