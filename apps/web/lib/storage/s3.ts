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
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AttachmentKind } from '@miguelfranken/protocol';
import { ATTACHMENT_KINDS, daysFor, type RetentionPolicy } from './retention/policy';
import type { S3StorageConfig } from './s3-config';
import type { RetentionOwner, StorageAdapter, StoredObject } from './types';

export { s3ConfigFromEnv, type S3StorageConfig } from './s3-config';

/** How long an upload or read URL is valid, in seconds. */
const URL_TTL_S = 15 * 60;
/** Keys per `DeleteObjects` call: the S3 maximum. */
const S3_DELETE_CHUNK = 1000;
/** The object tag lifecycle rules select on. Only attachments carry it, so avatars never expire. */
export const KIND_TAG = 'pwr-kind';
/** Lifecycle rules this app owns start with this; every other rule in the bucket is left alone. */
export const RULE_ID_PREFIX = 'pwr-retention-';

export function createS3Client(config: S3StorageConfig) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: config.credentials,
    // The SDK's default CRC32 checksums end up in presigned URLs and are
    // refused by several S3-compatible stores; send them only where S3
    // requires one (`DeleteObjects`).
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/**
 * The lifecycle rules that enforce a policy: one per attachment kind,
 * selecting on the kind tag every upload carries. A disabled policy has none.
 */
export function lifecycleRules(policy: RetentionPolicy, keyPrefix = ''): LifecycleRule[] {
  if (!policy.enabled) return [];
  return ATTACHMENT_KINDS.map((kind) => ({
    ID: `${RULE_ID_PREFIX}${kind}`,
    Status: 'Enabled',
    Filter: { And: { Prefix: `${keyPrefix}projects/`, Tags: [{ Key: KIND_TAG, Value: kind }] } },
    Expiration: { Days: daysFor(policy, kind) },
  }));
}

/** Replaces the rules this app owns and keeps everybody else's. */
export function mergeLifecycleRules(existing: LifecycleRule[], ours: LifecycleRule[]): LifecycleRule[] {
  return [...existing.filter((r) => !r.ID?.startsWith(RULE_ID_PREFIX)), ...ours];
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : '';
}

/**
 * A missing object, as opposed to a missing bucket or a denied request, which
 * must not read as "gone". A HEAD answer has no body, so there S3 reports a
 * missing bucket as a plain `NotFound` too.
 */
function isMissingObject(error: unknown) {
  const name = errorName(error);
  if (name === 'NoSuchKey' || name === 'NotFound') return true;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
  return status === 404 && name !== 'NoSuchBucket';
}

/**
 * Stores objects in an S3 bucket: AWS S3 or any S3-compatible store
 * (Cloudflare R2, MinIO, Hetzner, DigitalOcean Spaces, Neon, …).
 *
 * Uploads are presigned PUTs, so the reporter writes straight to the bucket
 * and no artifact passes through the app. Media the browser plays itself is
 * read from presigned GET URLs the same way.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly name = 's3' as const;
  readonly retention: RetentionOwner;
  readonly applyRetentionPolicy?: (policy: RetentionPolicy) => Promise<void>;
  readonly bucket: string;
  private readonly client: S3Client;

  constructor(
    readonly config: S3StorageConfig,
    client?: S3Client,
  ) {
    this.bucket = config.bucket;
    this.retention = config.retention;
    this.client = client ?? createS3Client(config);
    // Only a bucket this app manages lifetimes on is touched: an `app`
    // deployment may not even have the permission to read lifecycle rules.
    if (this.retention === 'provider') this.applyRetentionPolicy = (policy) => this.pushLifecycle(policy);
  }

  private key(key: string) {
    return `${this.config.keyPrefix}${key}`;
  }

  async createUpload(key: string, meta: { contentType: string; attachmentId: string; kind?: AttachmentKind }) {
    // The tag is what the lifecycle rules select on; without them it is not needed.
    const tagging = this.retention === 'provider' && meta.kind ? `${KIND_TAG}=${encodeURIComponent(meta.kind)}` : undefined;
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: this.key(key), ContentType: meta.contentType, Tagging: tagging });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: URL_TTL_S,
      // Signed, so the upload cannot change what the object claims to be.
      signableHeaders: new Set(['content-type']),
      // Kept as a header: S3 ignores tagging passed in the query string.
      unhoistableHeaders: tagging ? new Set(['x-amz-tagging']) : undefined,
    });
    return {
      strategy: 'presigned' as const,
      method: 'PUT' as const,
      url,
      headers: { 'content-type': meta.contentType, ...(tagging ? { 'x-amz-tagging': tagging } : {}) },
    };
  }

  /**
   * Signed at the start of the current window and valid for two, so the same
   * object keeps the same URL for a while and the browser can cache it, and a
   * URL handed out is always valid for at least one more window.
   */
  async readUrl(key: string) {
    const windowMs = URL_TTL_S * 1000;
    const signingDate = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }), {
      expiresIn: 2 * URL_TTL_S,
      signingDate,
    });
  }

  async put(key: string, body: ReadableStream<Uint8Array> | Uint8Array, meta: { contentType: string }) {
    if (body instanceof Uint8Array) {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: this.key(key), Body: body, ContentType: meta.contentType, ContentLength: body.byteLength }),
      );
      return { size: body.byteLength };
    }
    // A stream of unknown length: a multipart upload, counting bytes as they pass.
    let size = 0;
    const counted = body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
    );
    await new Upload({ client: this.client, params: { Bucket: this.bucket, Key: this.key(key), Body: counted, ContentType: meta.contentType } }).done();
    return { size };
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? 'application/octet-stream' };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async get(key: string, range?: { start: number; end?: number }): Promise<StoredObject | null> {
    let res;
    try {
      res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key), Range: range ? `bytes=${range.start}-${range.end ?? ''}` : undefined }),
      );
    } catch (error) {
      if (isMissingObject(error)) return null;
      // A range past the end: serve the whole object, as a server may ignore a Range header.
      if (range && errorName(error) === 'InvalidRange') return this.get(key);
      throw error;
    }
    if (!res.Body) return null;
    const stream = res.Body.transformToWebStream() as ReadableStream<Uint8Array>;
    const contentType = res.ContentType ?? 'application/octet-stream';
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(res.ContentRange ?? '');
    if (!range || !m) return { stream, contentType, size: res.ContentLength ?? 0 };
    return { stream, contentType, size: Number(m[3]), range: { start: Number(m[1]), end: Number(m[2]) } };
  }

  /**
   * Keys that do not exist are fine (S3 reports them as deleted). Any key S3
   * refuses fails the call, so the retention sweep rolls its batch back and
   * tries again instead of marking bytes expired that are still there.
   */
  async delete(keys: string[]) {
    for (let i = 0; i < keys.length; i += S3_DELETE_CHUNK) {
      const chunk = keys.slice(i, i + S3_DELETE_CHUNK);
      const res = await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: chunk.map((k) => ({ Key: this.key(k) })), Quiet: true } }),
      );
      const errors = res.Errors ?? [];
      if (errors.length > 0) {
        const [first] = errors;
        throw new Error(`S3 refused to delete ${errors.length} of ${chunk.length} objects (${first.Code}: ${first.Message} for ${first.Key})`);
      }
    }
  }

  private async pushLifecycle(policy: RetentionPolicy) {
    let existing: LifecycleRule[] = [];
    try {
      const res = await this.client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: this.bucket }));
      existing = res.Rules ?? [];
    } catch (error) {
      if (errorName(error) !== 'NoSuchLifecycleConfiguration') throw error;
    }
    const rules = mergeLifecycleRules(existing, lifecycleRules(policy, this.config.keyPrefix));
    if (rules.length === 0) {
      if (existing.length > 0) await this.client.send(new DeleteBucketLifecycleCommand({ Bucket: this.bucket }));
      return;
    }
    await this.client.send(new PutBucketLifecycleConfigurationCommand({ Bucket: this.bucket, LifecycleConfiguration: { Rules: rules } }));
  }
}
