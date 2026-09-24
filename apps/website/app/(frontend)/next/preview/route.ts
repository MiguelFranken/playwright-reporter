import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { payloadClient } from '@/lib/payload';
import { pathForSlug } from '@/lib/links';

/**
 * Turns on draft mode, so the page route serves unpublished content.
 *
 * Two gates, because either alone is insufficient: the shared secret keeps the
 * route from being a public draft-reader, and the Payload session check means
 * a leaked link is still useless to someone who cannot sign in to the CMS.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const slug = searchParams.get('slug') ?? 'home';

  const expected = process.env.PREVIEW_SECRET;
  if (!expected || secret !== expected) {
    return new Response('Invalid preview secret', { status: 403 });
  }

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: request.headers });
  if (!user) {
    return new Response('You must be signed in to the CMS to preview drafts', { status: 403 });
  }

  const draft = await draftMode();
  draft.enable();

  redirect(pathForSlug(slug));
}
