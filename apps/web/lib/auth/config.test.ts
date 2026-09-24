import { afterEach, describe, expect, it } from 'vitest';
import { trustedOrigins } from './config';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe('trustedOrigins', () => {
  it('trusts the base URL, every Vercel URL of the deployment and TRUSTED_ORIGINS', () => {
    process.env.BASE_URL = 'https://reports.example.test';
    process.env.VERCEL_URL = 'reports-abc123.vercel.app';
    process.env.VERCEL_BRANCH_URL = 'reports-git-main.vercel.app';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'reports.example.test';
    process.env.TRUSTED_ORIGINS = 'https://alias.example.test/, https://other.example.test';
    expect(trustedOrigins()).toEqual([
      'https://reports.example.test',
      'https://reports-abc123.vercel.app',
      'https://reports-git-main.vercel.app',
      'https://alias.example.test',
      'https://other.example.test',
    ]);
  });

  it('is just the base URL outside Vercel', () => {
    for (const k of ['BASE_URL', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'TRUSTED_ORIGINS', 'VERCEL_ENV']) {
      delete process.env[k];
    }
    expect(trustedOrigins()).toEqual(['http://localhost:3000']);
  });
});
