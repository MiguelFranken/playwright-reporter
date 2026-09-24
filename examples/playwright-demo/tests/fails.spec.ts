import { expect, test } from '@playwright/test';

test.describe('failures', () => {
  test('assertion failure', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.locator('#counter')).toHaveText('5', { timeout: 1500 });
  });

  test('element not found', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Does not exist' }).click({ timeout: 1500 });
  });

  test('times out', async ({ page }) => {
    test.setTimeout(2500);
    await page.goto('/');
    await page.waitForTimeout(10_000);
  });
});
