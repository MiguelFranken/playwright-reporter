/**
 * Helpers for the suites that run against the S3 stub (see
 * `s3-global-setup.ts`). Each file makes its own bucket, and `useS3Driver`
 * switches the app's `getStorage()` to it for that file.
 */
import { randomUUID } from 'node:crypto';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { describe, inject } from 'vitest';
import { createS3Client, type S3StorageConfig } from '@/lib/storage/s3';

const stub = inject('testS3');

export const s3Endpoint = stub?.endpoint ?? null;

/** `describe` when the stub is up, `describe.skip` when it could not be started. */
export const describeS3 = s3Endpoint ? describe : describe.skip;

/** The stub checks signatures, so these are the credentials it was started with; path-style because the bucket is not a DNS name there. */
export function s3TestConfig(bucket: string, overrides: Partial<S3StorageConfig> = {}): S3StorageConfig {
  return {
    bucket,
    region: 'us-east-1',
    endpoint: s3Endpoint ?? 'http://s3-stub-not-running.invalid',
    forcePathStyle: true,
    credentials: { accessKeyId: stub?.accessKeyId ?? 'unused', secretAccessKey: stub?.secretAccessKey ?? 'unused' },
    keyPrefix: '',
    retention: 'app',
    ...overrides,
  };
}

/** A bucket name no other file uses. */
export function uniqueBucket() {
  return `pwr-test-${randomUUID().slice(0, 12)}`;
}

/** A client for looking into the bucket from the test, past the adapter. */
export function bucketClient(bucket: string) {
  const client = createS3Client(s3TestConfig(bucket));

  async function listKeys(prefix?: string) {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      keys.push(...(page.Contents ?? []).map((o) => o.Key!));
      token = page.NextContinuationToken;
    } while (token);
    return keys;
  }

  return {
    client,
    async create() {
      await client.send(new CreateBucketCommand({ Bucket: bucket })).catch((error: Error) => {
        if (error.name !== 'BucketAlreadyOwnedByYou' && error.name !== 'BucketAlreadyExists') throw error;
      });
    },
    async empty() {
      const keys = await listKeys();
      for (let i = 0; i < keys.length; i += 1000) {
        await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } }));
      }
    },
    listKeys,
    async exists(key: string) {
      return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(
        () => true,
        (error: Error) => {
          if (error.name === 'NotFound' || error.name === 'NoSuchKey') return false;
          throw error;
        },
      );
    },
    async head(key: string) {
      const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { size: res.ContentLength, contentType: res.ContentType };
    },
    async tags(key: string) {
      const res = await client.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: key }));
      return Object.fromEntries((res.TagSet ?? []).map((t) => [t.Key, t.Value]));
    },
    async put(key: string, body: string | Uint8Array, contentType = 'application/octet-stream') {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
  };
}

/**
 * Points `getStorage()` at the stub for the rest of this file. Call it at the
 * top of the file, before anything calls `getStorage()`, which caches its
 * adapter; `setup.ts` has set the local driver by then.
 */
export function useS3Driver(bucket: string, env: Record<string, string> = {}) {
  const config = s3TestConfig(bucket);
  Object.assign(process.env, {
    STORAGE_DRIVER: 's3',
    S3_BUCKET: bucket,
    S3_REGION: config.region,
    S3_ENDPOINT: config.endpoint,
    S3_FORCE_PATH_STYLE: 'true',
    S3_ACCESS_KEY_ID: config.credentials!.accessKeyId,
    S3_SECRET_ACCESS_KEY: config.credentials!.secretAccessKey,
    ...env,
  });
}
