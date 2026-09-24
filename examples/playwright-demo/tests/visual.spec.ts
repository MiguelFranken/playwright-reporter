import { expect, test } from '@playwright/test';

test('visual: card snapshot', async ({ page }) => {
  await page.goto('/');
  // The baseline is created on the first run; later runs mutate the heading so the
  // comparison fails and produces expected/actual/diff attachments.
  await page.evaluate(() => {
    const h = document.querySelector('h1');
    if (h) h.textContent = `Demo App ${Date.now() % 2 === 0 ? 'A' : 'B'}`;
  });
  await expect(page.locator('.card')).toHaveScreenshot('card.png', { maxDiffPixels: 0 });
});
