import { expect, test } from './fixtures';

test.describe('Cart', () => {
  test('starts empty', async ({ shop, page }) => {
    await shop.open('#/cart');
    await expect(page.getByText('Your cart is empty.')).toBeVisible();
    await expect(page.getByLabel('Items in cart')).toHaveText('0');
  });

  test('recalculates when the quantity changes', async ({ shop, page }) => {
    await shop.addToCart('wool-socks');
    await shop.open('#/cart');
    await page.getByLabel('Quantity of Wool Socks').fill('3');
    await page.getByLabel('Quantity of Wool Socks').press('Tab');
    await expect(page.locator('#subtotal')).toHaveText('$42.00');
    await expect(page.getByLabel('Items in cart')).toHaveText('3');
  });

  test('removes a product', async ({ shop, page }) => {
    await shop.addToCart('canvas-cap');
    await shop.addToCart('tote-bag');
    await shop.open('#/cart');
    await page.getByRole('row', { name: /Canvas Cap/ }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('row', { name: /Canvas Cap/ })).toHaveCount(0);
    await expect(page.locator('#subtotal')).toHaveText('$19.00');
  });

  test.describe('coupons', () => {
    test.beforeEach(async ({ shop }) => {
      await shop.addToCart('merino-tee');
      await shop.open('#/cart');
    });

    test('takes 10% off with SAVE10', { tag: '@critical' }, async ({ page }) => {
      await page.getByPlaceholder('Coupon code').fill('SAVE10');
      await page.getByRole('button', { name: 'Apply' }).click();
      // The coupon service is meant to answer within a second.
      await expect(page.getByText('SAVE10 applied: 10% off')).toBeVisible({ timeout: 1000 });
      await expect(page.locator('#discount')).toHaveText('−$4.50');
      await expect(page.locator('#total')).toHaveText('$45.49');
    });

    test('accepts a code in lower case', async ({ page }) => {
      await page.getByPlaceholder('Coupon code').fill('save10');
      await page.getByRole('button', { name: 'Apply' }).click();
      await expect(page.getByText('SAVE10 applied: 10% off')).toBeVisible({ timeout: 1000 });
    });

    test('rejects an unknown code', async ({ page }) => {
      await page.getByPlaceholder('Coupon code').fill('FREESTUFF');
      await page.getByRole('button', { name: 'Apply' }).click();
      await expect(page.getByText('This coupon is not valid.')).toBeVisible();
      await expect(page.locator('#discount')).toHaveCount(0);
    });
  });

  test('is still there after a reload', async ({ shop, page }) => {
    await shop.addToCart('day-pack');
    await page.reload();
    await expect(page.getByLabel('Items in cart')).toHaveText('1');
  });
});
