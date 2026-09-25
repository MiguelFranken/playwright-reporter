import type { AttachmentKind, UploadInstruction } from '@miguelfranken/protocol';
import type { RetentionPolicy } from './retention/policy';

export type StorageDriver = 'local' | 'vercel-blob' | 's3';

/**
 * Who deletes expired artifacts. `app`: the retention sweep deletes the
 * objects itself (the filesystem, Vercel Blob — neither has lifecycle rules).
 * `provider`: the store expires objects on its own (e.g. an S3 bucket
 * lifecycle rule); the sweep only marks the rows, so old runs show the
 * artifact as expired instead of a broken link.
 */
export type RetentionOwner = 'app' | 'provider';

export interface StoredObject {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
  /** Set when a range was applied. */
  range?: { start: number; end: number };
}

export interface StorageAdapter {
  readonly name: StorageDriver;
  readonly retention: RetentionOwner;
  /**
   * For a `provider` store that can be configured from here: brings its own
   * lifecycle rules in line with the policy a superadmin saved. Throwing
   * fails the save, so the two never silently disagree.
   */
  applyRetentionPolicy?(policy: RetentionPolicy): Promise<void>;
  /** Tells the reporter how to upload the object for `key`. */
  createUpload(
    key: string,
    meta: { contentType: string; size?: number; attachmentId: string; kind?: AttachmentKind },
  ): Promise<Omit<UploadInstruction, 'attachmentId'>>;
  /** Server-side write (proxy strategy). */
  put(key: string, body: ReadableStream<Uint8Array> | Uint8Array, meta: { contentType: string }): Promise<{ size: number }>;
  get(key: string, range?: { start: number; end?: number }): Promise<StoredObject | null>;
  /** A short-lived URL the browser can read the object from directly, where the store has one. */
  readUrl?(key: string): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  /** Deletes objects; keys that do not exist are fine. */
  delete(keys: string[]): Promise<void>;
}
