import { expect, test } from './fixtures';

test.describe('Checkout', () => {
  test('ships for free from $50', { tag: '@critical' }, async ({ shop, page }) => {
    await shop.addToCart('trail-runner');
    await shop.open('#/checkout');
    await expect(page.locator('#shipping')).toHaveText('Free');
    await expect(page.locator('#total')).toHaveText('$89.00');
  });

  test('charges shipping below $50', async ({ shop, page }) => {
    await shop.addToCart('canvas-cap');
    await shop.open('#/checkout');
    await expect(page.locator('#shipping')).toHaveText('$4.99');
    await expect(page.locator('#total')).toHaveText('$26.99');
  });

  test('lists everything that is missing', async ({ shop, page }) => {
    await shop.addToCart('wool-socks');
    await shop.open('#/checkout');
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('list', { name: 'Errors' }).getByRole('listitem')).toHaveText([
      'Enter your full name.',
      'Enter a valid email address.',
      'Enter your address.',
      'Enter a 5-digit postal code.',
    ]);
  });

  test('declines a card that does not work', async ({ shop, page }) => {
    await shop.addToCart('wool-socks');
    await shop.open('#/checkout');
    await shop.fillCheckout({ card: '5555 5555 5555 4444' });
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByText('Your card was declined.')).toBeVisible();
  });

  test('places an order', { tag: ['@smoke', '@critical'] }, async ({ shop, page }, testInfo) => {
    await shop.addToCart('rain-shell');
    await shop.addToCart('wool-socks', 2);
    await shop.open('#/checkout');
    await shop.fillCheckout();
    await page.getByRole('button', { name: 'Place order' }).click();

    await expect(page.getByRole('heading', { name: 'Thank you for your order!' })).toBeVisible();
    await expect(page.locator('#order-id')).toHaveText(/^A-\d{5}$/);
    await expect(page.locator('#order-total')).toHaveText('$157.00');
    await expect(page.getByLabel('Items in cart')).toHaveText('0');

    await testInfo.attach('order', {
      body: JSON.stringify({ id: await page.locator('#order-id').textContent(), total: '$157.00' }, null, 2),
      contentType: 'application/json',
    });
  });
});
