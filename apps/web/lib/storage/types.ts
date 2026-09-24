import type { UploadInstruction } from '@miguelfranken/protocol';

export type StorageDriver = 'local' | 'vercel-blob';

export interface StoredObject {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
  /** Set when a range was applied. */
  range?: { start: number; end: number };
}

export interface StorageAdapter {
  readonly name: StorageDriver;
  /** Tells the reporter how to upload the object for `key`. */
  createUpload(
    key: string,
    meta: { contentType: string; size?: number; attachmentId: string },
  ): Promise<Omit<UploadInstruction, 'attachmentId'>>;
  /** Server-side write (proxy strategy). */
  put(key: string, body: ReadableStream<Uint8Array> | Uint8Array, meta: { contentType: string }): Promise<{ size: number }>;
  get(key: string, range?: { start: number; end?: number }): Promise<StoredObject | null>;
  /** A short-lived URL the browser can read the object from directly, where the store has one. */
  readUrl?(key: string): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
}
