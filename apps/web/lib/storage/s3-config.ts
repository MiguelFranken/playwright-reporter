/**
 * The S3 driver's settings, read from `S3_*`. Kept apart from the adapter so
 * pages that only show the settings do not load the AWS SDK.
 */
import type { RetentionOwner } from './types';

export interface S3StorageConfig {
  bucket: string;
  region: string;
  /** For S3-compatible stores (R2, MinIO, Hetzner, …); unset for AWS. */
  endpoint?: string;
  /** `https://endpoint/bucket/key` instead of `https://bucket.endpoint/key`; most self-hosted stores need it. */
  forcePathStyle: boolean;
  /** Unset: the AWS default credential chain (IAM role, `AWS_PROFILE`, web identity, …). */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /** Prepended to every key, `''` or ending in `/`, so one bucket can hold several deployments. */
  keyPrefix: string;
  /** `app`: the retention sweep deletes objects. `provider`: bucket lifecycle rules do. */
  retention: RetentionOwner;
}

function flag(value: string | undefined) {
  return value === 'true' || value === '1';
}

/**
 * Reads `S3_*` from the environment. Throws on a configuration that cannot
 * work, so a typo fails the first request loudly instead of falling back to
 * another store.
 */
export function s3ConfigFromEnv(env: Record<string, string | undefined> = process.env): S3StorageConfig {
  const bucket = env.S3_BUCKET?.trim();
  if (!bucket) throw new Error('STORAGE_DRIVER=s3 needs S3_BUCKET.');

  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error('Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use the AWS default credential chain.');
  }

  const mode = env.S3_RETENTION?.trim() || 'app';
  if (mode !== 'app' && mode !== 'lifecycle') throw new Error(`S3_RETENTION must be "app" or "lifecycle", not "${mode}".`);

  const prefix = (env.S3_KEY_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, '');
  const endpoint = env.S3_ENDPOINT?.trim().replace(/\/+$/, '') || undefined;

  return {
    bucket,
    region: env.S3_REGION?.trim() || env.AWS_REGION?.trim() || 'us-east-1',
    endpoint,
    forcePathStyle: flag(env.S3_FORCE_PATH_STYLE),
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey, ...(env.S3_SESSION_TOKEN ? { sessionToken: env.S3_SESSION_TOKEN } : {}) }
        : undefined,
    keyPrefix: prefix ? `${prefix}/` : '',
    retention: mode === 'lifecycle' ? 'provider' : 'app',
  };
}
