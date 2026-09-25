import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: './src/index.ts', contract: './src/contract.ts' },
  format: ['esm', 'cjs'],
  platform: 'neutral',
  fixedExtension: true,
  dts: true,
  clean: true,
  sourcemap: true,
});
