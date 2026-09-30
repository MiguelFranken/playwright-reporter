import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { S3StorageConfig } from './s3-config';

const loaded = vi.fn();
const head = vi.fn(async (key: string) => ({ size: key.length, contentType: 'image/png' }));
const pushLifecycle = vi.fn(async () => undefined);

vi.mock('./s3', () => {
  loaded();
  return {
    S3StorageAdapter: class {
      readonly applyRetentionPolicy = pushLifecycle;
      head = head;
    },
  };
});

const { LazyS3StorageAdapter } = await import('./s3-lazy');

const config = (retention: S3StorageConfig['retention']): S3StorageConfig => ({
  bucket: 'artifacts',
  region: 'eu-central-1',
  forcePathStyle: false,
  keyPrefix: '',
  retention,
});

describe('LazyS3StorageAdapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not load the AWS SDK until a call needs it, and then only once', async () => {
    const storage = new LazyS3StorageAdapter(config('app'));
    expect(storage.name).toBe('s3');
    expect(storage.retention).toBe('app');
    expect(storage.bucket).toBe('artifacts');
    expect(loaded).not.toHaveBeenCalled();

    expect(await storage.head('a.png')).toEqual({ size: 5, contentType: 'image/png' });
    await storage.head('bb.png');
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(head).toHaveBeenCalledTimes(2);
  });

  it('offers lifecycle rules only when the bucket owns retention', async () => {
    expect(new LazyS3StorageAdapter(config('app')).applyRetentionPolicy).toBeUndefined();

    const storage = new LazyS3StorageAdapter(config('provider'));
    const policy = { days: {} } as never;
    await storage.applyRetentionPolicy!(policy);
    expect(pushLifecycle).toHaveBeenCalledWith(policy);
  });
});
