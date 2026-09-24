import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': import.meta.dirname,
      // `server-only` throws outside a React Server Component; the modules
      // under test are plain async code.
      'server-only': `${import.meta.dirname}/test/server-only-stub.ts`,
    },
  },
  test: {
    name: 'unit',
    environment: 'node',
    include: ['lib/**/*.test.ts', 'payload/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
