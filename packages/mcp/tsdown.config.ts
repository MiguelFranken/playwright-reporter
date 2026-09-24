import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  entry: { index: './src/index.ts', cli: './src/cli.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: true,
  clean: true,
  sourcemap: true,
  // The bin reports its version in the User-Agent; stamping it at build time keeps the bridge free of file reads.
  // The release rebuilds after bumping package.json (release.config.mjs), so the published dist carries the new one.
  define: { __PW_REPORTER_MCP_VERSION__: JSON.stringify(version) },
  // The bin field is maintained by hand in package.json.
  exports: false,
  // Stable file names for the chunk shared by both entries, so rebuilds don't churn dist.
  outputOptions: { chunkFileNames: '[name].mjs' },
});
