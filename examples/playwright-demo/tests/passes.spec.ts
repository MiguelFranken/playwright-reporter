import { expect, test } from '@playwright/test';

test.describe('counter', () => {
  test('increments on click', { tag: ['@smoke'] }, async ({ page }) => {
    await page.goto('/');
    await test.step('click increment twice', async () => {
      await page.getByRole('button', { name: 'Increment' }).click();
      await page.getByRole('button', { name: 'Increment' }).click();
    });
    await expect(page.locator('#counter')).toHaveText('2');
  });

  test('greets by name', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Name').fill('Ada');
    await expect(page.locator('#greeting')).toHaveText('Hello, Ada!');
  });
});

test('navigates to about', { tag: ['@smoke', '@navigation'] }, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL(/about\.html$/);
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
});
