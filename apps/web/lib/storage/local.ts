import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { StorageAdapter, StoredObject } from './types';

/**
 * Stores objects as files under a root directory. A sidecar `.meta.json` keeps the content type.
 * Uploads go through the app (proxy strategy).
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'local' as const;
  readonly retention = 'app' as const;

  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
  ) {}

  private resolve(key: string) {
    const abs = path.resolve(this.root, key);
    if (!abs.startsWith(path.resolve(this.root) + path.sep)) throw new Error('invalid storage key');
    return abs;
  }

  async createUpload(_key: string, meta: { contentType: string; attachmentId: string }) {
    return {
      strategy: 'proxy' as const,
      method: 'PUT' as const,
      url: `${this.baseUrl}/api/ingest/uploads/${meta.attachmentId}`,
      headers: { 'content-type': meta.contentType },
    };
  }

  async put(key: string, body: ReadableStream<Uint8Array> | Uint8Array, meta: { contentType: string }) {
    const abs = this.resolve(key);
    await mkdir(path.dirname(abs), { recursive: true });
    let size = 0;
    if (body instanceof Uint8Array) {
      await writeFile(abs, body);
      size = body.byteLength;
    } else {
      const nodeStream = Readable.fromWeb(body as import('node:stream/web').ReadableStream);
      nodeStream.on('data', (chunk: Buffer) => {
        size += chunk.length;
      });
      await pipeline(nodeStream, createWriteStream(abs));
    }
    await writeFile(`${abs}.meta.json`, JSON.stringify({ contentType: meta.contentType, size }));
    return { size };
  }

  async head(key: string) {
    try {
      const abs = this.resolve(key);
      const [s, meta] = await Promise.all([stat(abs), readFile(`${abs}.meta.json`, 'utf8').catch(() => '{}')]);
      const parsed = JSON.parse(meta) as { contentType?: string };
      return { size: s.size, contentType: parsed.contentType ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  async get(key: string, range?: { start: number; end?: number }): Promise<StoredObject | null> {
    const head = await this.head(key);
    if (!head) return null;
    const abs = this.resolve(key);
    if (range) {
      const start = range.start;
      const end = Math.min(range.end ?? head.size - 1, head.size - 1);
      const stream = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream<Uint8Array>;
      return { stream, contentType: head.contentType, size: head.size, range: { start, end } };
    }
    const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream<Uint8Array>;
    return { stream, contentType: head.contentType, size: head.size };
  }

  async delete(keys: string[]) {
    await Promise.all(
      keys.map(async (k) => {
        const abs = this.resolve(k);
        await rm(abs, { force: true });
        await rm(`${abs}.meta.json`, { force: true });
      }),
    );
  }
}
