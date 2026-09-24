import { expect, test } from '@playwright/test';

test('flaky: passes on retry', async ({ page }, testInfo) => {
  await page.goto('/');
  console.log(`attempt ${testInfo.retry}`);
  if (testInfo.retry === 0) {
    await expect(page.locator('#counter')).toHaveText('1', { timeout: 1000 });
  }
  await expect(page.locator('#counter')).toHaveText('0');
});
