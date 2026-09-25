/**
 * The S3 adapter against a real S3 API: RustFS, started by
 * `s3-global-setup.ts`. The shared storage contract first, then what only an
 * object store does — presigned uploads and reads, the way the reporter and
 * the browser use them, multipart streams, batch deletes and lifecycle rules.
 * Every check looks into the bucket itself, past the adapter.
 */
import { GetBucketLifecycleConfigurationCommand, PutBucketLifecycleConfigurationCommand, type LifecycleRule } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { RetentionPolicy } from '@/lib/storage/retention/policy';
import { KIND_TAG, lifecycleRules, RULE_ID_PREFIX, S3StorageAdapter } from '@/lib/storage/s3';
import { storageContract } from '../helpers/storage-contract';
import { bucketClient, describeS3, s3TestConfig, uniqueBucket } from './s3';

const bucket = uniqueBucket();
const store = bucketClient(bucket);

const adapter = (overrides: Parameters<typeof s3TestConfig>[1] = {}) => new S3StorageAdapter(s3TestConfig(bucket, overrides));
const policy = (p: Partial<RetentionPolicy> = {}): RetentionPolicy => ({ enabled: true, days: 30, overrides: {}, ...p });

/** What the reporter does with an upload instruction (`packages/reporter/src/client.ts`). */
async function reporterUpload(instruction: { url: string; method: string; headers: Record<string, string> }, body: Uint8Array, contentType: string) {
  return fetch(instruction.url, {
    method: instruction.method,
    headers: { 'content-type': contentType, ...instruction.headers },
    body: new Blob([new Uint8Array(body)]),
  });
}

describeS3('S3 storage (RustFS)', () => {
  beforeAll(async () => {
    await store.create();
  });
  beforeEach(async () => {
    await store.empty();
  });
  afterAll(async () => {
    await store.empty();
  });

  storageContract('s3', () => adapter());
  storageContract('s3 with a key prefix', () => adapter({ keyPrefix: 'reporter/production/' }));

  it('stores under the key prefix, so several deployments can share a bucket', async () => {
    await adapter({ keyPrefix: 'reporter/production/' }).put('projects/p/a.txt', new TextEncoder().encode('a'), { contentType: 'text/plain' });
    expect(await store.listKeys()).toEqual(['reporter/production/projects/p/a.txt']);
  });

  it('takes a presigned upload straight from the reporter', async () => {
    const storage = adapter();
    const key = 'projects/p/runs/r/attempts/a/at-screenshot.png';
    const instruction = await storage.createUpload(key, { contentType: 'image/png', attachmentId: 'at', kind: 'screenshot' });
    expect(instruction.strategy).toBe('presigned');

    const body = new Uint8Array(4096).fill(9);
    const res = await reporterUpload(instruction, body, 'image/png');
    expect(res.status).toBe(200);

    expect(await store.head(key)).toEqual({ size: 4096, contentType: 'image/png' });
    // What `completeUpload` asks before it believes the reporter.
    expect(await storage.head(key)).toEqual({ size: 4096, contentType: 'image/png' });
  });

  it('refuses an upload whose content type differs from the signed one', async () => {
    const storage = adapter();
    const instruction = await storage.createUpload('projects/p/x.png', { contentType: 'image/png', attachmentId: 'x' });
    const res = await fetch(instruction.url, { method: 'PUT', headers: { 'content-type': 'text/html' }, body: '<script>' });
    expect(res.status).toBe(403);
    expect(await store.exists('projects/p/x.png')).toBe(false);
  });

  it('hands the browser a URL it can read the object and ranges from', async () => {
    const storage = adapter();
    await storage.put('projects/p/video.webm', new TextEncoder().encode('0123456789'), { contentType: 'video/webm' });
    const url = await storage.readUrl('projects/p/video.webm');

    const whole = await fetch(url);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-type')).toBe('video/webm');
    expect(await whole.text()).toBe('0123456789');

    // Video seeking: the store answers range requests itself.
    const part = await fetch(url, { headers: { range: 'bytes=3-5' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 3-5/10');
    expect(await part.text()).toBe('345');
  });

  it('writes a large stream as a multipart upload', async () => {
    const size = 12 * 1024 * 1024 + 123;
    const chunk = new Uint8Array(1024 * 1024).fill(1);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= size) return controller.close();
        const next = chunk.subarray(0, Math.min(chunk.byteLength, size - sent));
        sent += next.byteLength;
        controller.enqueue(next);
      },
    });
    expect(await adapter().put('projects/p/big.zip', stream, { contentType: 'application/zip' })).toEqual({ size });
    expect(await store.head('projects/p/big.zip')).toEqual({ size, contentType: 'application/zip' });
  });

  it('deletes more keys than one request takes', async () => {
    const keys = Array.from({ length: 1005 }, (_, i) => `projects/p/runs/r/${String(i).padStart(4, '0')}.txt`);
    for (let i = 0; i < keys.length; i += 50) {
      await Promise.all(keys.slice(i, i + 50).map((k) => store.put(k, 'x')));
    }
    await store.put('avatars/users/u/keep.png', 'keep');

    await adapter().delete([...keys, 'projects/p/never-there.txt']);
    expect(await store.listKeys()).toEqual(['avatars/users/u/keep.png']);
  });

  it('does not read a missing bucket as a missing object', async () => {
    const elsewhere = new S3StorageAdapter(s3TestConfig(uniqueBucket()));
    await expect(elsewhere.get('k')).rejects.toThrow(/bucket/i);
    // A HEAD answer has no body to say which one is missing, so S3 cannot
    // tell the two apart there; `get` is what serves artifacts.
    expect(await elsewhere.head('k')).toBeNull();
  });

  describeS3('lifecycle mode', () => {
    const lifecycle = () => adapter({ retention: 'provider' });

    async function rules(): Promise<LifecycleRule[]> {
      return store.client
        .send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
        .then((r) => r.Rules ?? [])
        .catch((error: Error) => {
          if (error.name === 'NoSuchLifecycleConfiguration') return [];
          throw error;
        });
    }

    /** A rule somebody else put on the bucket. */
    const FOREIGN: LifecycleRule = {
      ID: 'abort-incomplete-multipart',
      Status: 'Enabled',
      Filter: { Prefix: '' },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    };

    beforeEach(async () => {
      await store.client.send(new PutBucketLifecycleConfigurationCommand({ Bucket: bucket, LifecycleConfiguration: { Rules: [FOREIGN] } }));
    });

    it('tags every presigned upload with its kind, for the rules to select on', async () => {
      const storage = lifecycle();
      const key = 'projects/p/runs/r/attempts/a/at-video.webm';
      const instruction = await storage.createUpload(key, { contentType: 'video/webm', attachmentId: 'at', kind: 'video' });
      expect((await reporterUpload(instruction, new Uint8Array([1, 2, 3]), 'video/webm')).status).toBe(200);
      expect(await store.tags(key)).toEqual({ [KIND_TAG]: 'video' });
    });

    it('writes the saved policy to the bucket and keeps the rules it did not write', async () => {
      await lifecycle().applyRetentionPolicy!(policy({ days: 30, overrides: { video: 7, trace: 3 } }));
      const saved = await rules();
      expect(saved.find((r) => r.ID === FOREIGN.ID)).toMatchObject({ AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } });
      const ours = saved.filter((r) => r.ID?.startsWith(RULE_ID_PREFIX));
      expect(Object.fromEntries(ours.map((r) => [r.ID, r.Expiration?.Days]))).toEqual(
        Object.fromEntries(lifecycleRules(policy({ days: 30, overrides: { video: 7, trace: 3 } })).map((r) => [r.ID, r.Expiration?.Days])),
      );
      expect(ours.find((r) => r.ID === `${RULE_ID_PREFIX}video`)?.Filter).toMatchObject({
        And: { Prefix: 'projects/', Tags: [{ Key: KIND_TAG, Value: 'video' }] },
      });

      // A changed policy replaces the rules rather than adding to them.
      await lifecycle().applyRetentionPolicy!(policy({ days: 2 }));
      const changed = (await rules()).filter((r) => r.ID?.startsWith(RULE_ID_PREFIX));
      expect(changed).toHaveLength(6);
      expect(changed.every((r) => r.Expiration?.Days === 2)).toBe(true);
    });

    it('turning retention off removes its rules and nothing else', async () => {
      await lifecycle().applyRetentionPolicy!(policy());
      await lifecycle().applyRetentionPolicy!(policy({ enabled: false }));
      expect((await rules()).map((r) => r.ID)).toEqual([FOREIGN.ID]);
    });
  });
});
