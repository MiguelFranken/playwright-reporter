import { describe, expect, test } from 'vitest';
import { pushConfig } from './config';

describe('pushConfig', () => {
  test('is off without both keys', () => {
    expect(pushConfig({})).toBeNull();
    expect(pushConfig({ VAPID_PUBLIC_KEY: 'pub' })).toBeNull();
    expect(pushConfig({ VAPID_PRIVATE_KEY: 'priv' })).toBeNull();
    expect(pushConfig({ VAPID_PUBLIC_KEY: ' ', VAPID_PRIVATE_KEY: 'priv' })).toBeNull();
  });

  test('takes an explicit subject', () => {
    expect(pushConfig({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:ops@example.com' })).toEqual({
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'mailto:ops@example.com',
    });
  });

  test('falls back to a subject push services accept', () => {
    // The unit setup's BASE_URL is plain http, which push services refuse.
    expect(pushConfig({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })?.subject).toMatch(/^(mailto:|https:)/);
  });
});
