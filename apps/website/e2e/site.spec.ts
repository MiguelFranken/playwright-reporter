import { expect, test } from '@playwright/test';

/**
 * These assume the seed has run (`pnpm --filter @miguelfranken/website db:seed`): they
 * check the seeded site, not an empty CMS.
 */

test('the home page leads with the headline and the setup snippet', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every Playwright run, kept.');
  await expect(page.getByRole('tab', { name: 'playwright.config.ts' })).toBeVisible();
  await expect(page.getByText('No upload step.', { exact: false })).toBeVisible();
});

test('the hero demo renders the real product view', async ({ page }) => {
  await page.goto('/');

  // The demo is the app's own ActiveRuns view, driven by fixtures. Scoped to
  // the heading, because a step further down the page uses the same words.
  await expect(page.getByRole('heading', { name: /^active runs/i })).toBeVisible();
  await expect(page.getByText(/of 240 tests finished/)).toBeVisible();
});

test('every navigation link resolves', async ({ page, request }) => {
  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Main' }).first();
  const hrefs = await nav.getByRole('link').evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? ''),
  );

  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
  }
});

test('the comparison page says what the product does not do', async ({ page }) => {
  await page.goto('/compare');

  await expect(page.getByRole('table', { name: /comparison|compares/i }).first()).toBeVisible();
  await expect(page.getByText('Test management', { exact: false }).first()).toBeVisible();
});

test('the legal pages exist', async ({ page }) => {
  await page.goto('/legal/imprint');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Imprint');

  await page.goto('/legal/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy notice');
});

test('an unknown slug is a 404', async ({ page }) => {
  const response = await page.goto('/no-such-page');

  expect(response?.status()).toBe(404);
  await expect(page.getByText('This page does not exist')).toBeVisible();
});

test('the theme toggle switches the document class', async ({ page }) => {
  await page.goto('/');

  const html = page.locator('html');
  const before = (await html.getAttribute('class')) ?? '';

  await page.getByRole('button', { name: /toggle theme/i }).click();

  await expect
    .poll(async () => ((await html.getAttribute('class')) ?? '').includes('dark'))
    .toBe(!before.includes('dark'));
});

test('the admin panel serves its login form', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('robots and the sitemap list the site', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /admin');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);

  const xml = await sitemap.text();
  expect(xml).toContain('/features');
  expect(xml).not.toContain('/admin');
});
