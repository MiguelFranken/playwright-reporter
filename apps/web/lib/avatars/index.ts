/**
 * Profile images for users and teams: the pure half — validation, keys and
 * URLs. Storing and deleting the bytes lives in `./store.ts`.
 *
 * An avatar is addressed by its owner and a random id that changes with every
 * upload, so its URL can be cached forever and a replaced image never shows up
 * stale. The URL is what `users.image` / `teams.image` hold.
 */

// Not `isUuid` from `lib/db/queries/shared`: this module also runs in the
// browser, and that one would pull drizzle into the client bundle.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AvatarKind = 'users' | 'teams';

export type AvatarRef = { kind: AvatarKind; ownerId: string; avatarId: string };

/**
 * The browser crops and scales to `AVATAR_SIZE` before uploading, so a real
 * upload is tens of kilobytes; this only bounds what a hand-made request can
 * make the server read. Well under the 1 MB Server Action body limit.
 */
export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_SIZE = 256;

/** Raster formats only: an SVG can carry script. */
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type AvatarType = (typeof AVATAR_TYPES)[number];

const PREFIX = '/api/avatars/';

/**
 * The content type from the file's magic bytes. The declared type comes from
 * the client and is ignored.
 */
export function sniffImageType(bytes: Uint8Array): AvatarType | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x47, 0x49, 0x46, 0x38])) return 'image/gif'; // GIF8
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'; // RIFF….WEBP
  return null;
}

export function avatarKey({ kind, ownerId, avatarId }: AvatarRef) {
  return `avatars/${kind}/${ownerId}/${avatarId}`;
}

export function avatarUrl({ kind, ownerId, avatarId }: AvatarRef) {
  return `${PREFIX}${kind}/${ownerId}/${avatarId}`;
}

/** The inverse of `avatarUrl`; `null` for anything this app did not issue. */
export function parseAvatarUrl(url: string | null | undefined): AvatarRef | null {
  if (!url?.startsWith(PREFIX)) return null;
  const [kind, ownerId, avatarId, ...rest] = url.slice(PREFIX.length).split('/');
  if (rest.length > 0) return null;
  return parseAvatarRef(kind, ownerId, avatarId);
}

export function parseAvatarRef(kind: string | undefined, ownerId: string | undefined, avatarId: string | undefined): AvatarRef | null {
  if (kind !== 'users' && kind !== 'teams') return null;
  if (!ownerId || !avatarId || !UUID_RE.test(ownerId) || !UUID_RE.test(avatarId)) return null;
  return { kind, ownerId, avatarId };
}

/**
 * The image to render, or `null` for the initials fallback. Only URLs this app
 * issued are shown: anything else in the column (an out-of-band write, an old
 * Better Auth value) would make every viewer's browser fetch a third-party URL.
 */
export function displayableAvatar(url: string | null | undefined): string | null {
  return parseAvatarUrl(url) ? url! : null;
}
