import path from 'node:path';
import { baseUrl } from '../auth/config';
import { LocalStorageAdapter } from './local';
import type { StorageAdapter, StorageDriver } from './types';
import { VercelBlobStorageAdapter } from './vercel-blob';

export type { StorageAdapter, StorageDriver } from './types';
export { baseUrl };

export function storageDriver(): StorageDriver {
  const d = process.env.STORAGE_DRIVER;
  if (d === 'local' || d === 'vercel-blob') return d;
  return process.env.VERCEL ? 'vercel-blob' : 'local';
}

let cached: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (cached) return cached;
  const driver = storageDriver();
  cached =
    driver === 'vercel-blob'
      ? new VercelBlobStorageAdapter(process.env.BLOB_READ_WRITE_TOKEN)
      : new LocalStorageAdapter(path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_LOCAL_DIR ?? '.storage'), baseUrl());
  return cached;
}

export function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'file';
}

export function storageKey(parts: {
  projectId: string;
  runId: string;
  attemptId: string;
  attachmentId: string;
  name: string;
}) {
  return `projects/${parts.projectId}/runs/${parts.runId}/attempts/${parts.attemptId}/${parts.attachmentId}-${sanitizeName(parts.name)}`;
}
