import { expect, test } from './fixtures';

test.describe('Account', () => {
  test('signs in', { tag: '@smoke' }, async ({ shop, page }) => {
    await shop.signIn();
    await expect(page.getByRole('heading', { name: 'Hello, Sam Shopper' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
  });

  test('rejects a wrong password', async ({ shop, page }) => {
    await shop.signIn('shopper@acme.test', 'tr0ub4dor');
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  });

  test('lists past orders', async ({ shop, page }) => {
    await shop.signIn();
    await shop.addToCart('canvas-cap');
    await shop.open('#/checkout');
    await shop.fillCheckout();
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for your order!' })).toBeVisible();

    await shop.open('#/account');
    await expect(page.getByRole('table', { name: 'Orders' }).getByRole('row')).toHaveCount(2);
  });

  test('signs out', async ({ shop, page }) => {
    await shop.signIn();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('sends a signed-out visitor to sign in', async ({ shop, page }) => {
    await shop.open('#/account');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
  });

  test.fixme('resets a forgotten password', async () => {
    // Waiting for the email service.
  });
});
