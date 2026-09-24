import { defineConfig } from 'vitest/config';

// Node-side unit tests only (pure helpers and the import guard). Component
// behaviour is tested through the stories, in a real browser, from
// apps/storybook.
export default defineConfig({
  test: {
    name: 'ui',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
