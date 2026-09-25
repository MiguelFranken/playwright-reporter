/**
 * The S3 adapter without a bucket: presigning is pure computation, and every
 * other call goes through `client.send`, which is spied on here. The same
 * adapter runs against a real S3 API (RustFS) in
 * `test/integration/s3-storage.test.ts`.
 */
import {
  DeleteBucketLifecycleCommand,
  DeleteObjectsCommand,
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
  type LifecycleRule,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RetentionPolicy } from './retention/policy';
import { createS3Client, KIND_TAG, lifecycleRules, mergeLifecycleRules, RULE_ID_PREFIX, S3StorageAdapter, s3ConfigFromEnv, type S3StorageConfig } from './s3';

const config = (overrides: Partial<S3StorageConfig> = {}): S3StorageConfig => ({
  bucket: 'artifacts',
  region: 'eu-central-1',
  endpoint: 'http://s3.test:4566',
  forcePathStyle: true,
  credentials: { accessKeyId: 'AKIDTEST', secretAccessKey: 'secret' },
  keyPrefix: '',
  retention: 'app',
  ...overrides,
});

/** An error shaped like the SDK's service exceptions. */
function s3Error(name: string, status: number) {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
}

type Handler = (command: object) => unknown;

/** A real client (presigning needs one) whose network calls answer from `handler`. */
function adapter(overrides: Partial<S3StorageConfig> = {}, handler: Handler = () => ({})) {
  const cfg = config(overrides);
  const client = createS3Client(cfg);
  const send = vi.spyOn(client, 'send').mockImplementation((async (command: object) => handler(command)) as S3Client['send']);
  return { storage: new S3StorageAdapter(cfg, client), send };
}

const sent = (send: ReturnType<typeof adapter>['send']) => send.mock.calls.map(([command]) => command as unknown as { input: Record<string, unknown> });

const policy = (p: Partial<RetentionPolicy> = {}): RetentionPolicy => ({ enabled: true, days: 30, overrides: {}, ...p });

afterEach(() => {
  vi.useRealTimers();
});

describe('s3ConfigFromEnv', () => {
  it('needs a bucket', () => {
    expect(() => s3ConfigFromEnv({})).toThrow(/S3_BUCKET/);
    expect(() => s3ConfigFromEnv({ S3_BUCKET: '  ' })).toThrow(/S3_BUCKET/);
  });

  it('defaults to AWS, virtual-hosted addressing and the default credential chain', () => {
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b' })).toEqual({
      bucket: 'b',
      region: 'us-east-1',
      endpoint: undefined,
      forcePathStyle: false,
      credentials: undefined,
      keyPrefix: '',
      retention: 'app',
    });
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', AWS_REGION: 'eu-west-1' }).region).toBe('eu-west-1');
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', AWS_REGION: 'eu-west-1', S3_REGION: 'auto' }).region).toBe('auto');
  });

  it('reads an S3-compatible endpoint with path-style addressing', () => {
    const c = s3ConfigFromEnv({ S3_BUCKET: 'b', S3_ENDPOINT: 'https://minio.internal:9000/', S3_FORCE_PATH_STYLE: 'true' });
    expect(c.endpoint).toBe('https://minio.internal:9000');
    expect(c.forcePathStyle).toBe(true);
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', S3_FORCE_PATH_STYLE: '1' }).forcePathStyle).toBe(true);
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', S3_FORCE_PATH_STYLE: 'no' }).forcePathStyle).toBe(false);
  });

  it('takes static credentials only as a pair', () => {
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret' }).credentials).toEqual({
      accessKeyId: 'id',
      secretAccessKey: 'secret',
    });
    expect(
      s3ConfigFromEnv({ S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret', S3_SESSION_TOKEN: 'tok' }).credentials,
    ).toEqual({ accessKeyId: 'id', secretAccessKey: 'secret', sessionToken: 'tok' });
    expect(() => s3ConfigFromEnv({ S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'id' })).toThrow(/both/);
    expect(() => s3ConfigFromEnv({ S3_BUCKET: 'b', S3_SECRET_ACCESS_KEY: 'secret' })).toThrow(/both/);
  });

  it('normalizes the key prefix to end in exactly one slash', () => {
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', S3_KEY_PREFIX: '/reporter/prod//' }).keyPrefix).toBe('reporter/prod/');
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', S3_KEY_PREFIX: '/' }).keyPrefix).toBe('');
  });

  it('hands retention to the bucket only when asked, and refuses anything else', () => {
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', S3_RETENTION: 'app' }).retention).toBe('app');
    expect(s3ConfigFromEnv({ S3_BUCKET: 'b', S3_RETENTION: 'lifecycle' }).retention).toBe('provider');
    expect(() => s3ConfigFromEnv({ S3_BUCKET: 'b', S3_RETENTION: 'provider' })).toThrow(/S3_RETENTION/);
  });
});

describe('lifecycle rules', () => {
  it('has none for a disabled policy', () => {
    expect(lifecycleRules(policy({ enabled: false }))).toEqual([]);
  });

  it('has one rule per kind, selecting on the kind tag under the attachment prefix', () => {
    const rules = lifecycleRules(policy({ days: 30, overrides: { video: 7, trace: 3 } }), 'reporter/');
    expect(rules.map((r) => r.ID)).toEqual(['screenshot', 'video', 'trace', 'image', 'text', 'other'].map((k) => `${RULE_ID_PREFIX}${k}`));
    expect(rules.map((r) => r.Expiration?.Days)).toEqual([30, 7, 3, 30, 30, 30]);
    expect(rules[1]).toEqual({
      ID: `${RULE_ID_PREFIX}video`,
      Status: 'Enabled',
      Filter: { And: { Prefix: 'reporter/projects/', Tags: [{ Key: KIND_TAG, Value: 'video' }] } },
      Expiration: { Days: 7 },
    });
  });

  it('replaces its own rules and keeps everybody else’s', () => {
    const foreign: LifecycleRule = { ID: 'abort-multipart', Status: 'Enabled', Filter: { Prefix: '' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } };
    const stale: LifecycleRule = { ID: `${RULE_ID_PREFIX}video`, Status: 'Enabled', Expiration: { Days: 99 } };
    const ours = lifecycleRules(policy({ days: 5 }));
    expect(mergeLifecycleRules([foreign, stale], ours)).toEqual([foreign, ...ours]);
    expect(mergeLifecycleRules([foreign, stale], [])).toEqual([foreign]);
  });
});

describe('S3StorageAdapter', () => {
  it('identifies itself and owns retention unless the bucket does', () => {
    const app = adapter().storage;
    expect(app.name).toBe('s3');
    expect(app.retention).toBe('app');
    // Without lifecycle mode the bucket's rules are never read or written.
    expect(app.applyRetentionPolicy).toBeUndefined();
    const provider = adapter({ retention: 'provider' }).storage;
    expect(provider.retention).toBe('provider');
    expect(provider.applyRetentionPolicy).toBeTypeOf('function');
  });

  describe('createUpload', () => {
    it('presigns a PUT to the key, with the content type signed', async () => {
      const { storage, send } = adapter({ keyPrefix: 'reporter/' });
      const instruction = await storage.createUpload('projects/p/runs/r/attempts/a/id-shot.png', {
        contentType: 'image/png',
        attachmentId: 'id',
        kind: 'screenshot',
      });
      expect(instruction).toMatchObject({ strategy: 'presigned', method: 'PUT', headers: { 'content-type': 'image/png' } });
      const url = new URL(instruction.url);
      expect(`${url.origin}${url.pathname}`).toBe('http://s3.test:4566/artifacts/reporter/projects/p/runs/r/attempts/a/id-shot.png');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
      expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(expect.arrayContaining(['content-type', 'host']));
      // Presigning is offline: nothing was sent.
      expect(send).not.toHaveBeenCalled();
    });

    it('carries no SDK checksum, which S3-compatible stores refuse on presigned uploads', async () => {
      const { url } = await adapter().storage.createUpload('k', { contentType: 'text/plain', attachmentId: 'id' });
      expect(url.toLowerCase()).not.toContain('checksum');
    });

    it('tags the object with its kind in lifecycle mode, as a signed header', async () => {
      const { storage } = adapter({ retention: 'provider' });
      const instruction = await storage.createUpload('k', { contentType: 'video/webm', attachmentId: 'id', kind: 'video' });
      expect(instruction.headers).toEqual({ 'content-type': 'video/webm', 'x-amz-tagging': `${KIND_TAG}=video` });
      const url = new URL(instruction.url);
      expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain('x-amz-tagging');
      expect(url.searchParams.has('x-amz-tagging')).toBe(false);
    });

    it('does not tag in app mode, where no rule reads the tag', async () => {
      const instruction = await adapter().storage.createUpload('k', { contentType: 'video/webm', attachmentId: 'id', kind: 'video' });
      expect(instruction.headers).toEqual({ 'content-type': 'video/webm' });
    });

    it('addresses the bucket as a subdomain without path-style', async () => {
      const { url } = await adapter({ endpoint: undefined, forcePathStyle: false }).storage.createUpload('a/b.png', {
        contentType: 'image/png',
        attachmentId: 'id',
      });
      expect(new URL(url).host).toBe('artifacts.s3.eu-central-1.amazonaws.com');
      expect(new URL(url).pathname).toBe('/a/b.png');
    });
  });

  describe('readUrl', () => {
    it('stays the same within a window, so the browser can cache it, and changes after', async () => {
      vi.useFakeTimers();
      const { storage } = adapter();
      vi.setSystemTime(new Date('2026-01-01T10:00:10Z'));
      const first = await storage.readUrl('a/b.webm');
      vi.setSystemTime(new Date('2026-01-01T10:14:50Z'));
      expect(await storage.readUrl('a/b.webm')).toBe(first);
      vi.setSystemTime(new Date('2026-01-01T10:15:01Z'));
      expect(await storage.readUrl('a/b.webm')).not.toBe(first);

      const url = new URL(first);
      expect(url.pathname).toBe('/artifacts/a/b.webm');
      expect(url.searchParams.get('X-Amz-Date')).toBe('20260101T100000Z');
      // Valid for two windows from the signing time: always at least one more.
      expect(url.searchParams.get('X-Amz-Expires')).toBe('1800');
    });
  });

  describe('head and get', () => {
    it('reports size and content type', async () => {
      const { storage } = adapter({}, () => ({ ContentLength: 10, ContentType: 'text/plain' }));
      expect(await storage.head('k')).toEqual({ size: 10, contentType: 'text/plain' });
    });

    it('reads a missing object as null', async () => {
      expect(await adapter({}, () => Promise.reject(s3Error('NotFound', 404))).storage.head('k')).toBeNull();
      expect(await adapter({}, () => Promise.reject(s3Error('NoSuchKey', 404))).storage.get('k')).toBeNull();
    });

    it('does not mistake a missing bucket or a denied request for a missing object', async () => {
      await expect(adapter({}, () => Promise.reject(s3Error('NoSuchBucket', 404))).storage.get('k')).rejects.toThrow('NoSuchBucket');
      await expect(adapter({}, () => Promise.reject(s3Error('Forbidden', 403))).storage.head('k')).rejects.toThrow('Forbidden');
      await expect(adapter({}, () => Promise.reject(s3Error('AccessDenied', 403))).storage.get('k')).rejects.toThrow('AccessDenied');
    });

    it('asks S3 for the range and reports what it served', async () => {
      const body = { transformToWebStream: () => new Response('2345').body };
      const { storage, send } = adapter({ keyPrefix: 'p/' }, () => ({ Body: body, ContentType: 'text/plain', ContentLength: 4, ContentRange: 'bytes 2-5/10' }));
      const stored = await storage.get('doc.txt', { start: 2, end: 5 });
      expect(stored).toMatchObject({ contentType: 'text/plain', size: 10, range: { start: 2, end: 5 } });
      expect(await new Response(stored!.stream).text()).toBe('2345');
      const [command] = sent(send);
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toEqual({ Bucket: 'artifacts', Key: 'p/doc.txt', Range: 'bytes=2-5' });

      await storage.get('doc.txt', { start: 7 });
      expect(sent(send)[1].input.Range).toBe('bytes=7-');
    });

    it('serves the whole object for a range past its end', async () => {
      const body = { transformToWebStream: () => new Response('0123456789').body };
      const { storage, send } = adapter({}, (command) =>
        (command as GetObjectCommand).input.Range ? Promise.reject(s3Error('InvalidRange', 416)) : { Body: body, ContentLength: 10 },
      );
      const stored = await storage.get('doc.txt', { start: 50 });
      expect(stored).toMatchObject({ size: 10, contentType: 'application/octet-stream' });
      expect(stored!.range).toBeUndefined();
      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  describe('put', () => {
    it('writes a buffer in one request with its length', async () => {
      const { storage, send } = adapter({ keyPrefix: 'p/' });
      expect(await storage.put('a.png', new Uint8Array([1, 2, 3]), { contentType: 'image/png' })).toEqual({ size: 3 });
      const [command] = sent(send);
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({ Bucket: 'artifacts', Key: 'p/a.png', ContentType: 'image/png', ContentLength: 3 });
    });
  });

  describe('delete', () => {
    it('deletes in chunks of 1000, quietly, under the key prefix', async () => {
      const { storage, send } = adapter({ keyPrefix: 'p/' }, () => ({}));
      const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
      await storage.delete(keys);
      const commands = sent(send);
      expect(commands.every((c) => c instanceof DeleteObjectsCommand)).toBe(true);
      const deletes = commands.map((c) => c.input.Delete as { Objects: { Key: string }[]; Quiet: boolean });
      expect(deletes.map((d) => d.Objects.length)).toEqual([1000, 1000, 500]);
      expect(deletes.flatMap((d) => d.Objects.map((o) => o.Key))).toEqual(keys.map((k) => `p/${k}`));
      expect(deletes.every((d) => d.Quiet)).toBe(true);
    });

    it('makes no call for nothing', async () => {
      const { storage, send } = adapter();
      await storage.delete([]);
      expect(send).not.toHaveBeenCalled();
    });

    it('fails when S3 refuses any key, so the sweep retries the batch', async () => {
      const { storage } = adapter({}, () => ({ Errors: [{ Key: 'k1', Code: 'AccessDenied', Message: 'Access Denied' }] }));
      await expect(storage.delete(['k1', 'k2'])).rejects.toThrow(/refused to delete 1 of 2 objects \(AccessDenied: Access Denied for k1\)/);
    });
  });

  describe('applyRetentionPolicy', () => {
    const foreign: LifecycleRule = { ID: 'abort-multipart', Status: 'Enabled', Filter: { Prefix: '' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } };

    function lifecycleBucket(initial: LifecycleRule[] | null, failGet?: Error) {
      return adapter({ retention: 'provider' }, (command) => {
        if (command instanceof GetBucketLifecycleConfigurationCommand) {
          if (failGet) return Promise.reject(failGet);
          return initial ? { Rules: initial } : Promise.reject(s3Error('NoSuchLifecycleConfiguration', 404));
        }
        return {};
      });
    }

    it('writes one rule per kind to a bucket without rules', async () => {
      const { storage, send } = lifecycleBucket(null);
      await storage.applyRetentionPolicy!(policy({ days: 14, overrides: { video: 2 } }));
      const put = sent(send).find((c) => c instanceof PutBucketLifecycleConfigurationCommand)!;
      expect(put.input).toEqual({ Bucket: 'artifacts', LifecycleConfiguration: { Rules: lifecycleRules(policy({ days: 14, overrides: { video: 2 } })) } });
    });

    it('keeps the rules somebody else put on the bucket', async () => {
      const { storage, send } = lifecycleBucket([foreign, { ID: `${RULE_ID_PREFIX}trace`, Status: 'Enabled', Expiration: { Days: 1 } }]);
      await storage.applyRetentionPolicy!(policy({ days: 3 }));
      const put = sent(send).find((c) => c instanceof PutBucketLifecycleConfigurationCommand)!;
      const rules = (put.input.LifecycleConfiguration as { Rules: LifecycleRule[] }).Rules;
      expect(rules[0]).toEqual(foreign);
      expect(rules.slice(1).map((r) => r.Expiration?.Days)).toEqual([3, 3, 3, 3, 3, 3]);
    });

    it('turning retention off removes only its own rules', async () => {
      const { storage, send } = lifecycleBucket([foreign, ...lifecycleRules(policy())]);
      await storage.applyRetentionPolicy!(policy({ enabled: false }));
      const put = sent(send).find((c) => c instanceof PutBucketLifecycleConfigurationCommand)!;
      expect(put.input.LifecycleConfiguration).toEqual({ Rules: [foreign] });
    });

    it('deletes the configuration when nothing is left, and writes nothing when nothing was there', async () => {
      const ours = lifecycleBucket(lifecycleRules(policy()));
      await ours.storage.applyRetentionPolicy!(policy({ enabled: false }));
      expect(sent(ours.send).map((c) => c.constructor)).toEqual([GetBucketLifecycleConfigurationCommand, DeleteBucketLifecycleCommand]);

      const empty = lifecycleBucket(null);
      await empty.storage.applyRetentionPolicy!(policy({ enabled: false }));
      expect(sent(empty.send).map((c) => c.constructor)).toEqual([GetBucketLifecycleConfigurationCommand]);
    });

    it('fails, and writes nothing, when the rules cannot be read', async () => {
      const { storage, send } = lifecycleBucket(null, s3Error('AccessDenied', 403));
      await expect(storage.applyRetentionPolicy!(policy())).rejects.toThrow('AccessDenied');
      expect(sent(send).some((c) => c instanceof PutBucketLifecycleConfigurationCommand)).toBe(false);
    });
  });
});

describe('createS3Client', () => {
  it('computes checksums only where S3 requires one', async () => {
    const client = createS3Client(config());
    expect(await client.config.requestChecksumCalculation()).toBe('WHEN_REQUIRED');
    expect(await client.config.responseChecksumValidation()).toBe('WHEN_REQUIRED');
    expect(HeadObjectCommand).toBeDefined();
  });
});
