import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const baseURL = process.env.BASE_URL ?? 'http://localhost:3001';

/**
 * Smoke tests only. The design system's own behaviour is covered by the
 * Storybook run; what is left to check is that the CMS content actually
 * reaches the browser — that the seeded pages render, that the navigation
 * between them resolves, and that the admin panel is up.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    // Against a production build: `force-static` and the prerendered pages are
    // the thing under test, and `next dev` renders everything on demand.
    command: 'pnpm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
