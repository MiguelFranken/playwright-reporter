/**
 * The code the site shows. Kept in one place because the same reporter entry
 * appears on the home page and on `/get-started`, and the two drifting apart
 * would be the most embarrassing possible bug on a marketing site.
 */

export const reporterConfig = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['@repo/reporter', {
      url: process.env.PW_REPORTER_URL,
      token: process.env.PW_REPORTER_TOKEN,
    }],
  ],
});`;

export const reporterEnv = `# The deployment you are reporting to, and the project token it issued.
PW_REPORTER_URL=https://reports.example.com
PW_REPORTER_TOKEN=prj_live_xxxxxxxxxxxxxxxx`;

export const githubActions = `- name: Run Playwright
  run: pnpm exec playwright test --shard=\${{ matrix.shard }}/4
  env:
    PW_REPORTER_URL: \${{ vars.PW_REPORTER_URL }}
    PW_REPORTER_TOKEN: \${{ secrets.PW_REPORTER_TOKEN }}`;

export const cloneAndRun = `git clone https://github.com/mfranken/playwright-reporter
cd playwright-reporter
pnpm install`;

export const envSetup = `cp apps/web/.env.example apps/web/.env.local
# DATABASE_URL and DATABASE_URL_UNPOOLED from your Neon branch
# BETTER_AUTH_SECRET: openssl rand -hex 32`;

export const migrateAndSeed = `pnpm db:migrate
pnpm db:seed          # prints the first superadmin's password once`;

export const runTheDemo = `pnpm --filter @repo/web dev
pnpm --filter playwright-demo test:e2e`;

export const deployToVercel = `vercel link
vercel env pull
vercel deploy --prod`;
