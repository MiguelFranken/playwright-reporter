import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env', quiet: true });

/**
 * The live demo's suite. Without `PW_REPORTER_TOKEN` the reporter stays off,
 * so a plain `playwright test` just runs the tests. `DEMO_SCENARIO` picks how
 * the shop behaves (see `schedule.ts`).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 2,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  captureGitInfo: { commit: true },
  reporter: [
    ['list'],
    ['@miguelfranken/reporter', { environment: process.env.PW_REPORTER_ENVIRONMENT ?? 'local' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    actionTimeout: 5_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
