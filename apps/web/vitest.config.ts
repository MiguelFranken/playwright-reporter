import { workflow } from '@workflow/vitest';
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
          include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'proxy.test.ts'],
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
          // Postgres for every file, and the S3 stub for the S3 storage suites.
          globalSetup: ['test/integration/global-setup.ts', 'test/integration/s3-global-setup.ts'],
          setupFiles: ['test/integration/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
          maxWorkers: 4,
          sequence: { groupOrder: 1 },
          // `isolate` must stay true: the per-file database relies on each file
          // getting a fresh module graph so `lib/db/drizzle` binds to its URL.
        },
      },
      {
        // Workflows run for real, in process: the plugin compiles the
        // directives, bundles the workflow and its steps, and serves a local
        // world. The database setup is the integration project's.
        resolve: { alias },
        plugins: [workflow({ rootDir: `${import.meta.dirname}/node_modules/.cache/workflow-vitest` })],
        test: {
          name: 'workflow',
          environment: 'node',
          include: ['test/workflow/**/*.test.ts'],
          globalSetup: ['test/integration/global-setup.ts'],
          setupFiles: ['test/workflow/json-import-hook.ts', 'test/integration/setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          maxWorkers: 2,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
