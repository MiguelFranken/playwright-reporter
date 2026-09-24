import { del, get, head, put } from '@vercel/blob';
import type { StorageAdapter, StoredObject } from './types';

/**
 * Stores objects in a private Vercel Blob store. Uploads from the reporter go through the app
 * (proxy strategy) in this version; a presigned strategy can be added once the store is created
 * in the target Vercel project. Reads are streamed through the artifact route with `get()`.
 */
export class VercelBlobStorageAdapter implements StorageAdapter {
  readonly name = 'vercel-blob' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  private opts() {
    return this.token ? { token: this.token } : {};
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
    const data = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
    await put(key, Buffer.from(data), {
      access: 'private',
      contentType: meta.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      ...this.opts(),
    });
    return { size: data.byteLength };
  }

  async head(key: string) {
    try {
      const h = await head(key, this.opts());
      return { size: h.size, contentType: h.contentType };
    } catch {
      return null;
    }
  }

  async get(key: string, range?: { start: number; end?: number }): Promise<StoredObject | null> {
    const res = await get(key, { access: 'private', ...this.opts() });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const size = Number(res.headers.get('content-length') ?? 0);
    if (!range) return { stream: res.stream, contentType, size };
    // Blob has no range support in the SDK; slice in memory (videos are small for demo runs).
    const buf = new Uint8Array(await new Response(res.stream).arrayBuffer());
    const end = Math.min(range.end ?? buf.byteLength - 1, buf.byteLength - 1);
    const slice = buf.slice(range.start, end + 1);
    return {
      stream: new Response(slice).body as ReadableStream<Uint8Array>,
      contentType,
      size: buf.byteLength,
      range: { start: range.start, end },
    };
  }

  async delete(keys: string[]) {
    if (keys.length) await del(keys, this.opts());
  }
}
