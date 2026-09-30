/**
 * The S3 driver, with the AWS SDK loaded on first use. `getStorage` is on the
 * path of every ingest request and artifact read; importing `./s3` statically
 * would evaluate the SDK on every new function instance, including the ones
 * running another driver.
 */
import type { AttachmentKind } from '@miguelfranken/protocol';
import type { RetentionPolicy } from './retention/policy';
import type { S3StorageAdapter } from './s3';
import type { S3StorageConfig } from './s3-config';
import type { RetentionOwner, StorageAdapter } from './types';

export class LazyS3StorageAdapter implements StorageAdapter {
  readonly name = 's3' as const;
  readonly retention: RetentionOwner;
  readonly applyRetentionPolicy?: (policy: RetentionPolicy) => Promise<void>;
  private adapter?: Promise<S3StorageAdapter>;

  constructor(readonly config: S3StorageConfig) {
    this.retention = config.retention;
    if (this.retention === 'provider') this.applyRetentionPolicy = async (policy) => (await this.load()).applyRetentionPolicy?.(policy);
  }

  private load() {
    this.adapter ??= import('./s3').then(({ S3StorageAdapter }) => new S3StorageAdapter(this.config));
    return this.adapter;
  }

  async createUpload(key: string, meta: { contentType: string; size?: number; attachmentId: string; kind?: AttachmentKind }) {
    return (await this.load()).createUpload(key, meta);
  }

  async put(key: string, body: ReadableStream<Uint8Array> | Uint8Array, meta: { contentType: string }) {
    return (await this.load()).put(key, body, meta);
  }

  async get(key: string, range?: { start: number; end?: number }) {
    return (await this.load()).get(key, range);
  }

  async readUrl(key: string) {
    return (await this.load()).readUrl(key);
  }

  async head(key: string) {
    return (await this.load()).head(key);
  }

  async delete(keys: string[]) {
    return (await this.load()).delete(keys);
  }
}
