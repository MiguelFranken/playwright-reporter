import { expect, test } from '@playwright/test';

test('steps and attachments', { tag: ['@steps'] }, async ({ page }, testInfo) => {
  await test.step('open home', async () => {
    await page.goto('/');
  });
  await test.step('interact', async () => {
    await test.step('increment', async () => {
      await page.getByRole('button', { name: 'Increment' }).click();
    });
    await test.step('type name', async () => {
      await page.getByLabel('Name').fill('Grace');
    });
  });
  await testInfo.attach('notes', { body: 'Custom log line 1\nCustom log line 2', contentType: 'text/plain' });
  await testInfo.attach('state', {
    body: JSON.stringify({ counter: 1, name: 'Grace' }, null, 2),
    contentType: 'application/json',
  });
  testInfo.annotations.push({ type: 'owner', description: 'team-web' });
  await expect(page.locator('#counter')).toHaveText('1');
});
