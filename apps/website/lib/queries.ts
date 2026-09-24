import { draftMode } from 'next/headers';
import { payloadClient } from '@/lib/payload';
import type { Footer, Header, Page, SiteSetting } from '@/payload-types';

/**
 * Every read from the frontend passes `overrideAccess: false`.
 *
 * The Local API bypasses access control by default, which would serve
 * unpublished drafts to anonymous visitors. `authenticatedOrPublished` on the
 * collection is only actually enforced because of this flag (Payload skill,
 * security pitfall #1).
 */
export async function queryPageBySlug(slug: string): Promise<Page | null> {
  const { isEnabled: draft } = await draftMode();
  const payload = await payloadClient();

  const result = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    draft,
    overrideAccess: false,
    limit: 1,
    depth: 2,
    pagination: false,
  });

  return result.docs[0] ?? null;
}

/** Published pages only — what `generateStaticParams` and the sitemap list. */
export async function queryPublishedPages(): Promise<Pick<Page, 'slug' | 'updatedAt'>[]> {
  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'pages',
    where: { _status: { equals: 'published' } },
    overrideAccess: false,
    depth: 0,
    limit: 500,
    pagination: false,
    select: { slug: true, updatedAt: true },
  });
  return result.docs as Pick<Page, 'slug' | 'updatedAt'>[];
}

export async function queryHeader(): Promise<Header> {
  const payload = await payloadClient();
  return payload.findGlobal({ slug: 'header', depth: 2, overrideAccess: false });
}

export async function queryFooter(): Promise<Footer> {
  const payload = await payloadClient();
  return payload.findGlobal({ slug: 'footer', depth: 2, overrideAccess: false });
}

export async function querySiteSettings(): Promise<SiteSetting> {
  const payload = await payloadClient();
  return payload.findGlobal({ slug: 'site-settings', depth: 1, overrideAccess: false });
}
