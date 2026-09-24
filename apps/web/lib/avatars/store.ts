import 'server-only';
import { randomUUID } from 'node:crypto';
import { getStorage } from '@/lib/storage';
import { AVATAR_MAX_BYTES, avatarKey, avatarUrl, parseAvatarUrl, sniffImageType, type AvatarKind } from './index';

/**
 * Validates an uploaded image and writes it to storage. Returns the URL to put
 * in the owner's `image` column, or a message for the form.
 */
export async function storeAvatar(kind: AvatarKind, ownerId: string, file: FormDataEntryValue | null): Promise<{ url: string } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image to upload.' };
  if (file.size > AVATAR_MAX_BYTES) return { error: 'That image is too large. Pick one under 512 KB.' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) return { error: 'Use a PNG, JPEG, WebP or GIF image.' };

  const ref = { kind, ownerId, avatarId: randomUUID() };
  await getStorage().put(avatarKey(ref), bytes, { contentType });
  return { url: avatarUrl(ref) };
}

/**
 * Removes the bytes behind a previous `image` value. Only ever deletes under the
 * owner's own prefix, whatever the column holds. Best effort: the row has
 * already moved on, so a failure leaves an orphan, never a broken image.
 */
export async function deleteAvatar(kind: AvatarKind, ownerId: string, url: string | null | undefined) {
  const ref = parseAvatarUrl(url);
  if (!ref || ref.kind !== kind || ref.ownerId !== ownerId) return;
  await getStorage()
    .delete([avatarKey(ref)])
    .catch((error) => console.error('[storage] avatar delete failed', error));
}
