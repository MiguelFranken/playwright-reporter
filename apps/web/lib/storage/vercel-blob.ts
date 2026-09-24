import { del, get, head, issueSignedToken, parseStoreIdFromDelegationToken, presignUrl, put, type IssuedSignedToken } from '@vercel/blob';
import type { StorageAdapter, StoredObject } from './types';

/** How long an upload or read URL is valid. */
const URL_TTL_MS = 15 * 60 * 1000;
/** Signed-token material is reused until this close to its expiry. */
const TOKEN_REFRESH_MS = 20 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 60 * 1000;
/** The Blob API version the upload headers speak, as `@vercel/blob` sends it. */
const BLOB_API_VERSION = '12';

/**
 * Stores objects in a private Vercel Blob store.
 *
 * Uploads are presigned: the reporter PUTs straight to Blob, so an artifact
 * never passes through a function — no 4.5 MB request limit, no function time
 * spent copying bytes. Reads of media the browser plays itself (videos,
 * screenshots) redirect to a presigned URL the same way, which also gives
 * video seeking real range requests.
 */
export class VercelBlobStorageAdapter implements StorageAdapter {
  readonly name = 'vercel-blob' as const;
  private signed: Promise<IssuedSignedToken> | null = null;
  private signedUntil = 0;

  constructor(private readonly token?: string) {}

  private opts() {
    return this.token ? { token: this.token } : {};
  }

  /** One signed token per instance and hour, not one control-API call per URL. */
  private signedToken(): Promise<IssuedSignedToken> {
    if (!this.signed || Date.now() > this.signedUntil - TOKEN_REFRESH_MS) {
      const validUntil = Date.now() + TOKEN_TTL_MS;
      this.signedUntil = validUntil;
      this.signed = issueSignedToken({ ...this.opts(), pathname: '*', operations: ['put', 'get'], validUntil }).catch((err) => {
        this.signed = null;
        throw err;
      });
    }
    return this.signed;
  }

  async createUpload(key: string, meta: { contentType: string; attachmentId: string }) {
    const signed = await this.signedToken();
    const { presignedUrl } = await presignUrl(signed, {
      operation: 'put',
      pathname: key,
      access: 'private',
      allowOverwrite: true,
      addRandomSuffix: false,
      validUntil: Date.now() + URL_TTL_MS,
    });
    return {
      strategy: 'presigned' as const,
      method: 'PUT' as const,
      url: presignedUrl,
      headers: {
        'x-api-version': BLOB_API_VERSION,
        'x-vercel-blob-store-id': parseStoreIdFromDelegationToken(signed.delegationToken),
        'x-vercel-blob-access': 'private',
        'x-content-type': meta.contentType,
        'x-allow-overwrite': '1',
        'x-add-random-suffix': '0',
      },
    };
  }

  async readUrl(key: string) {
    const signed = await this.signedToken();
    // Rounded, so the same object keeps the same URL for a while and the browser can cache it.
    const validUntil = Math.min(signed.validUntil, Math.ceil((Date.now() + URL_TTL_MS) / URL_TTL_MS) * URL_TTL_MS);
    const { presignedUrl } = await presignUrl(signed, { operation: 'get', pathname: key, access: 'private', validUntil });
    return presignedUrl;
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
    if (!range) {
      const res = await get(key, { access: 'private', ...this.opts() });
      if (!res || res.statusCode !== 200 || !res.stream) return null;
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
      const size = Number(res.headers.get('content-length') ?? 0);
      return { stream: res.stream, contentType, size };
    }
    // Blob serves ranges itself, so only the requested bytes are read.
    const res = await fetch(await this.readUrl(key), { headers: { range: `bytes=${range.start}-${range.end ?? ''}` } });
    if (!res.ok || !res.body) return null;
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(res.headers.get('content-range') ?? '');
    if (res.status !== 206 || !m) {
      return { stream: res.body, contentType, size: Number(res.headers.get('content-length') ?? 0) };
    }
    return { stream: res.body, contentType, size: Number(m[3]), range: { start: Number(m[1]), end: Number(m[2]) } };
  }

  async delete(keys: string[]) {
    if (keys.length) await del(keys, this.opts());
  }
}
