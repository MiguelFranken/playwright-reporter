import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env', quiet: true });

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 2,
  workers: 2,
  captureGitInfo: { commit: true },
  reporter: [
    ['list'],
    [
      '@repo/reporter',
      {
        token: process.env.PW_REPORTER_TOKEN,
        serverUrl: process.env.PW_REPORTER_URL ?? 'http://localhost:3000',
        tags: ['demo'],
        environment: process.env.PW_REPORTER_ENVIRONMENT ?? 'local',
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
