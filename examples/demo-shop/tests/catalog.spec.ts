import { expect, test } from './fixtures';

test.describe('Catalog', () => {
  test.beforeEach(async ({ shop }) => {
    await shop.open();
  });

  test('lists every product', { tag: '@smoke' }, async ({ shop }) => {
    await expect(shop.products()).toHaveCount(12);
  });

  test('filters by category', async ({ shop, page }) => {
    await page.getByLabel('Category').selectOption('Shoes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shoes');
    await expect(shop.products()).toHaveCount(2);
  });

  test('sorts by price, low to high', async ({ shop, page }) => {
    await page.getByLabel('Sort by').selectOption('price-asc');
    await expect(shop.products().first()).toContainText('Wool Socks');
    await expect(shop.products().first()).toContainText('$14.00');
    await expect(shop.products().last()).toContainText('Rain Shell Jacket');
  });

  test('sorts by rating', async ({ shop, page }) => {
    await page.getByLabel('Sort by').selectOption('rating');
    await expect(shop.products().first()).toContainText('Rain Shell Jacket');
  });

  test('marks sold-out products', async ({ shop }) => {
    await expect(shop.products().filter({ hasText: 'Down Vest' })).toContainText('Out of stock');
    await expect(shop.products().filter({ hasText: 'Out of stock' })).toHaveCount(1);
  });

  test('opens a product from the catalog', async ({ page }) => {
    await page.getByRole('link', { name: 'Trail Runner Shoes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trail Runner Shoes');
    await expect(page).toHaveTitle(/Trail Runner Shoes/);
  });
});
