import { test as base, expect, type Page } from '@playwright/test';
import { scenario } from '../schedule';

/**
 * Every test starts with an empty shop in the scenario `DEMO_SCENARIO` names
 * (see `schedule.ts`): its latencies and the regressions it ships with.
 */
export const test = base.extend<{ shop: Shop }>({
  page: async ({ page }, use) => {
    await page.addInitScript((config) => {
      (window as unknown as { __ACME__: unknown }).__ACME__ = config;
    }, scenario(process.env.DEMO_SCENARIO));
    await use(page);
  },
  shop: async ({ page }, use) => {
    await use(new Shop(page));
  },
});

export { expect };

/** What a shopper does, in the words of the tests. */
export class Shop {
  constructor(readonly page: Page) {}

  async open(hash = '#/') {
    await this.page.goto(`/${hash}`);
    await expect(this.page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  products() {
    return this.page.getByRole('list', { name: 'Products' }).getByRole('listitem');
  }

  async addToCart(productId: string, quantity = 1) {
    await test.step(`add ${quantity} × ${productId} to the cart`, async () => {
      await this.open(`#/product/${productId}`);
      if (quantity !== 1) await this.page.getByLabel('Quantity', { exact: true }).fill(String(quantity));
      await this.page.getByRole('button', { name: 'Add to cart' }).click();
      await expect(this.page.getByRole('status').filter({ hasText: 'Added' })).toBeVisible();
    });
  }

  async fillCheckout(fields: Partial<Record<'name' | 'email' | 'address' | 'zip' | 'card', string>> = {}) {
    const values = { name: 'Sam Shopper', email: 'shopper@acme.test', address: '1 Main Street', zip: '10115', card: '4242424242424242', ...fields };
    await test.step('fill in the checkout form', async () => {
      await this.page.getByLabel('Full name').fill(values.name);
      await this.page.getByLabel('Email').fill(values.email);
      await this.page.getByLabel('Address').fill(values.address);
      await this.page.getByLabel('Postal code').fill(values.zip);
      await this.page.getByLabel('Card number').fill(values.card);
    });
  }

  async signIn(email = 'shopper@acme.test', password = 'correct-horse') {
    await test.step('sign in', async () => {
      await this.open('#/login');
      await this.page.getByLabel('Email').fill(email);
      await this.page.getByLabel('Password').fill(password);
      await this.page.getByRole('button', { name: 'Sign in' }).click();
      // Signed in, or told why not: either way the login request is done.
      const greeting = this.page.getByRole('heading', { name: /^Hello/ });
      await expect(greeting.or(this.page.getByRole('alert').filter({ hasText: /\S/ }))).toBeVisible();
    });
  }
}
