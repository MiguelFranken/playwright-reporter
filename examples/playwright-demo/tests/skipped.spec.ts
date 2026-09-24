import { test } from '@playwright/test';

test.skip('skipped: not implemented yet', async () => {});

test('skipped conditionally on firefox', async ({ browserName }) => {
  test.skip(browserName === 'firefox', 'not supported on firefox');
});
