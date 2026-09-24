import { defineConfig } from 'vitest/config';

const alias = {
  '@': import.meta.dirname,
  // `server-only` throws outside a React Server Component; the modules under
  // test are plain async code.
  'server-only': `${import.meta.dirname}/test/helpers/server-only-stub.ts`,
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
          exclude: ['test/**', 'node_modules/**'],
          setupFiles: ['test/helpers/unit-setup.ts'],
          // `pnpm test:all` runs the fast project first; the groups must also
          // differ because the two projects size their worker pools apart.
          sequence: { groupOrder: 0 },
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/integration/global-setup.ts'],
          setupFiles: ['test/integration/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
          maxWorkers: 4,
          sequence: { groupOrder: 1 },
          // `isolate` must stay true: the per-file database relies on each file
          // getting a fresh module graph so `lib/db/drizzle` binds to its URL.
        },
      },
    ],
  },
});
