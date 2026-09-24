import { AccessError, requireTeamIdOr404, requireUserOr401 } from '@/lib/auth/access';
import { avatarKey, parseAvatarRef } from '@/lib/avatars';
import { getStorage } from '@/lib/storage';

type Params = Promise<{ kind: string; ownerId: string; avatarId: string }>;

/**
 * A user or team profile image. Any signed-in user may see a user's image —
 * people show up in each other's member lists — while a team's image needs
 * access to that team. Each upload gets a new id, so a response never changes
 * and can be cached for good.
 */
export async function GET(_request: Request, { params }: { params: Params }) {
  const { kind, ownerId, avatarId } = await params;
  const ref = parseAvatarRef(kind, ownerId, avatarId);
  if (!ref) return new Response('not found', { status: 404 });

  try {
    if (ref.kind === 'teams') await requireTeamIdOr404(ref.ownerId);
    else await requireUserOr401();
  } catch (error) {
    if (error instanceof AccessError) return error.toResponse();
    throw error;
  }

  const storage = getStorage();
  const key = avatarKey(ref);

  if (storage.readUrl) {
    // Presigned URLs expire, so the redirect is only cached as long as one lives.
    return new Response(null, { status: 302, headers: { location: await storage.readUrl(key), 'cache-control': 'private, max-age=600' } });
  }

  const obj = await storage.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.stream, {
    status: 200,
    headers: {
      // Sniffed from the bytes at upload time, never taken from the client.
      'content-type': obj.contentType,
      'content-length': String(obj.size),
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
