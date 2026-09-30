/**
 * A screenshot at one of the widths `next/image` asks for (`?w=640`): the
 * original resized once with sharp, kept in the store beside it, and read
 * from there afterwards. Same access as the artifact itself. A width at or
 * above the original's sends the original, lossless (see `image-variants`).
 */
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { gone, readableArtifact } from '@/lib/artifacts/access';
import { RESIZABLE_KINDS, snapWidth, VARIANT_QUALITY, variantKey } from '@/lib/artifacts/image-variants';
import { db } from '@/lib/db/drizzle';
import { reviewCaptures } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { markMissingExpired } from '@/lib/storage/retention';

/** Copies are as immutable as the original they were made from; access can still be revoked, so a day. */
const CACHE = 'private, max-age=86400';

export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  const readable = await readableArtifact(request, attachmentId);
  if (readable instanceof Response) return readable;
  const { attachment } = readable;
  if (attachment.status === 'expired') return gone();

  const url = new URL(request.url);
  const original = () => {
    // The original route, with the signature this request carried.
    const to = new URL(`/api/artifacts/${attachment.id}`, url);
    for (const k of ['exp', 'sig']) if (url.searchParams.has(k)) to.searchParams.set(k, url.searchParams.get(k)!);
    return new Response(null, { status: 307, headers: { location: `${to.pathname}${to.search}`, 'cache-control': CACHE } });
  };
  if (!RESIZABLE_KINDS.has(attachment.kind) || !(attachment.contentType ?? '').startsWith('image/') || attachment.status !== 'uploaded') return original();

  const width = snapWidth(Number(url.searchParams.get('w')));
  const [capture] = await db.select({ width: reviewCaptures.width }).from(reviewCaptures).where(eq(reviewCaptures.attachmentId, attachment.id)).limit(1);
  if (capture?.width && width >= capture.width) return original();

  const storage = getStorage();
  const key = variantKey(attachment.storageKey, width);
  const stored = await storage.head(key).catch(() => null);
  if (stored) {
    if (storage.readUrl) return new Response(null, { status: 302, headers: { location: await storage.readUrl(key), 'cache-control': 'private, max-age=600' } });
    const obj = await storage.get(key);
    if (obj) return new Response(obj.stream, { status: 200, headers: imageHeaders(obj.size, obj.contentType) });
  }

  const source = await storage.get(attachment.storageKey);
  if (!source) {
    if (await markMissingExpired(attachment.id, storage)) return gone();
    return new Response('artifact missing in storage', { status: 404 });
  }
  let bytes: Buffer;
  let type = 'image/webp';
  try {
    const input = Buffer.from(await new Response(source.stream).arrayBuffer());
    const image = sharp(input);
    const meta = await image.metadata();
    // Narrower than asked for (a capture that recorded no width): the original is the better answer.
    if (meta.width && width >= meta.width) return original();
    const resized = image.resize({ width, withoutEnlargement: true });
    // WebP stops at 16383 px a side; a very long page stays PNG.
    const tall = meta.width && meta.height ? Math.round((meta.height * width) / meta.width) > WEBP_MAX : false;
    if (tall) type = 'image/png';
    bytes = await (tall ? resized.png({ compressionLevel: 8 }) : resized.webp({ quality: VARIANT_QUALITY, effort: 4 })).toBuffer();
  } catch (error) {
    console.error('[image] resizing failed', attachment.id, error);
    return original();
  }
  // Kept for the next request; a store that refuses the write only costs the next one a resize.
  await storage.put(key, bytes, { contentType: type }).catch((error: unknown) => console.error('[image] storing a copy failed', key, error));
  return new Response(new Uint8Array(bytes), { status: 200, headers: imageHeaders(bytes.byteLength, type) });
}

const WEBP_MAX = 16383;

function imageHeaders(size: number, type: string): Record<string, string> {
  return { 'content-type': type, 'content-length': String(size), 'cache-control': CACHE, 'x-content-type-options': 'nosniff' };
}
