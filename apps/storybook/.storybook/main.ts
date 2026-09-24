import type { StorybookConfig } from '@storybook/react-vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');

// Relative to THIS directory: both Storybook and the Vitest plugin resolve
// story globs against the config dir, and an absolute glob is appended to it
// rather than replacing it.
const ui = '../../../packages/ui/src';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../docs/**/*.mdx', `${ui}/**/*.stories.@(ts|tsx)`],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-vitest',
  ],
  core: { disableTelemetry: true },
  typescript: {
    // Not `react-docgen-typescript`: it drives the TypeScript compiler API
    // directly and this repo is on TypeScript 7, whose API is still
    // experimental — it throws on `fileExists` during config resolution.
    // The babel-based docgen needs no compiler and reads our props fine.
    reactDocgen: 'react-docgen',
  },
  async viteFinal(config) {
    const { mergeConfig } = await import('vite');
    const tailwind = (await import('@tailwindcss/vite')).default;
    return mergeConfig(config, {
      plugins: [tailwind()],
      // The stories live outside apps/storybook.
      server: { fs: { allow: [repoRoot] } },
    });
  },
};

export default config;
