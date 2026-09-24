import { expect, test } from './fixtures';

test.describe('Product page', () => {
  test('shows the price and the stock', async ({ shop, page }) => {
    await shop.open('#/product/rain-shell');
    await expect(page.getByText('$129.00')).toBeVisible();
    await expect(page.getByText('5 in stock')).toBeVisible();
  });

  test('keeps the quantity within the stock', async ({ shop, page }) => {
    await shop.open('#/product/trail-socks');
    const increase = page.getByRole('button', { name: 'Increase quantity' });
    for (let i = 0; i < 5; i++) await increase.click();
    await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('3');
  });

  test('adds to the cart and updates the badge', { tag: '@smoke' }, async ({ shop, page }) => {
    await shop.addToCart('merino-tee', 2);
    await expect(page.getByLabel('Items in cart')).toHaveText('2');
  });

  test('cannot add a sold-out product', async ({ shop, page }) => {
    await shop.open('#/product/down-vest');
    await expect(page.getByText('Out of stock')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
  });
});
