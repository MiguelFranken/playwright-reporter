import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { baseUrl, sanitizeName, storageDriver, storageKey } from './index';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe('sanitizeName', () => {
  it('keeps the characters that are safe in a storage key', () => {
    expect(sanitizeName('trace.zip')).toBe('trace.zip');
    expect(sanitizeName('my-screenshot_1.png')).toBe('my-screenshot_1.png');
  });

  it('collapses everything else into a single dash', () => {
    expect(sanitizeName('a b c.png')).toBe('a-b-c.png');
    expect(sanitizeName('weird///name')).toBe('weird-name');
    expect(sanitizeName('émoji 🎉 shot.png')).toBe('-moji-shot.png');
  });

  it('cannot escape its directory', () => {
    // Dots survive, separators do not — so `..` can never become a path segment.
    expect(sanitizeName('../../etc/passwd')).toBe('..-..-etc-passwd');
    expect(sanitizeName('../../etc/passwd')).not.toContain('/');
    expect(sanitizeName('..\\..\\windows')).not.toContain('\\');
  });

  it('truncates to 80 characters', () => {
    expect(sanitizeName('a'.repeat(200))).toHaveLength(80);
  });

  it('never returns an empty name', () => {
    expect(sanitizeName('')).toBe('file');
    // Anything that survives as at least one character is kept as it is.
    expect(sanitizeName('///')).toBe('-');
  });
});

describe('storageKey', () => {
  const parts = {
    projectId: 'p1',
    runId: 'r1',
    attemptId: 'a1',
    attachmentId: 'at1',
    name: 'screenshot.png',
  };

  it('nests by project, run and attempt', () => {
    expect(storageKey(parts)).toBe('projects/p1/runs/r1/attempts/a1/at1-screenshot.png');
  });

  it('sanitizes the file name it appends', () => {
    expect(storageKey({ ...parts, name: '../secrets' })).toBe('projects/p1/runs/r1/attempts/a1/at1-..-secrets');
  });

  it('gives two attachments of one attempt distinct keys', () => {
    expect(storageKey(parts)).not.toBe(storageKey({ ...parts, attachmentId: 'at2' }));
  });
});

describe('storageDriver', () => {
  beforeEach(() => {
    delete process.env.STORAGE_DRIVER;
    delete process.env.VERCEL;
  });

  it('honours an explicit driver', () => {
    process.env.STORAGE_DRIVER = 'local';
    expect(storageDriver()).toBe('local');
    process.env.STORAGE_DRIVER = 'vercel-blob';
    expect(storageDriver()).toBe('vercel-blob');
  });

  it('falls back to blob storage on Vercel and to the filesystem elsewhere', () => {
    expect(storageDriver()).toBe('local');
    process.env.VERCEL = '1';
    expect(storageDriver()).toBe('vercel-blob');
  });

  it('ignores an unrecognised value rather than trusting it', () => {
    process.env.STORAGE_DRIVER = 's3';
    expect(storageDriver()).toBe('local');
    process.env.VERCEL = '1';
    expect(storageDriver()).toBe('vercel-blob');
  });
});

describe('baseUrl', () => {
  it('defaults to localhost and strips trailing slashes', () => {
    delete process.env.BASE_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    expect(baseUrl()).toBe('http://localhost:3000');
    process.env.BASE_URL = 'https://reports.example.test///';
    expect(baseUrl()).toBe('https://reports.example.test');
  });

  it('falls back to the Vercel production domain, or the deployment URL on previews', () => {
    delete process.env.BASE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'reports.example.test';
    process.env.VERCEL_URL = 'reports-abc123.vercel.app';
    process.env.VERCEL_ENV = 'production';
    expect(baseUrl()).toBe('https://reports.example.test');
    process.env.VERCEL_ENV = 'preview';
    expect(baseUrl()).toBe('https://reports-abc123.vercel.app');
    process.env.BASE_URL = 'https://explicit.example.test';
    expect(baseUrl()).toBe('https://explicit.example.test');
  });
});
