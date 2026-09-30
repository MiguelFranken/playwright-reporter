import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

// Both projects drive the same browser, so each instance carries its own name.
// Vitest takes the project name from the instance, which is why neither project
// sets `test.name` — that would collide with the name derived here.
const browser = (name: string) => ({
  enabled: true,
  headless: true,
  provider: playwright(),
  instances: [{ browser: 'chromium' as const, name }],
});

// No setup file: since Storybook 10.3 the addon applies the preview's
// annotations itself, and a `setProjectAnnotations` call would make it skip
// that and do the job worse.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [storybookTest({ configDir: './.storybook' })],
        test: { browser: browser('storybook') },
      },
      {
        // The whole catalogue again in dark mode, so the accessibility check
        // (contrast above all) covers both themes. No story is duplicated.
        plugins: [
          storybookTest({
            configDir: './.storybook',
            initialGlobals: { theme: 'dark' },
          }),
        ],
        test: { browser: browser('storybook-dark') },
      },
    ],
  },
});
