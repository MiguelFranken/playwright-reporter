import { expect, test } from './fixtures';

test.describe('Search', () => {
  test.beforeEach(async ({ shop }) => {
    await shop.open();
  });

  test('suggests products while typing', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search products' }).pressSequentially('trail', { delay: 30 });
    // Suggestions should feel instant; the search service does not always agree.
    const suggestions = page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option');
    await expect(suggestions).toHaveText(['Trail Runner Shoes', 'Trail Running Socks'], { timeout: 1000 });
  });

  test('shows results for a query', { tag: '@smoke' }, async ({ shop, page }) => {
    await page.getByRole('searchbox', { name: 'Search products' }).fill('socks');
    await page.getByRole('searchbox', { name: 'Search products' }).press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Results for “socks”');
    await expect(shop.products()).toHaveCount(2);
  });

  test('says when nothing matches', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search products' }).fill('umbrella');
    await page.getByRole('searchbox', { name: 'Search products' }).press('Enter');
    await expect(page.getByText('No products match your search.')).toBeVisible();
  });

  test('focuses the search box on /', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones have no keyboard shortcuts');
    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox', { name: 'Search products' })).toBeFocused();
  });
});
