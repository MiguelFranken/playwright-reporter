import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload';
import { revalidatePath } from 'next/cache';
import type { Page } from '@/payload-types';

/** `home` is the reserved slug for `/`; every other slug is its own path. */
export function pathForSlug(slug: string | null | undefined): string {
  if (!slug || slug === 'home') return '/';
  return `/${slug}`;
}

/**
 * The paths a change touches. Publishing revalidates the new path;
 * unpublishing or renaming also revalidates the path the page used to live at,
 * or the old URL keeps serving a page that no longer exists there.
 */
export function pathsToRevalidate({
  slug,
  status,
  previousSlug,
  previousStatus,
}: {
  slug?: string | null;
  status?: string | null;
  previousSlug?: string | null;
  previousStatus?: string | null;
}): string[] {
  const paths = new Set<string>();
  if (status === 'published') paths.add(pathForSlug(slug));
  if (previousStatus === 'published') {
    // Unpublished, or published under a different slug: the old path must go.
    if (status !== 'published' || previousSlug !== slug) paths.add(pathForSlug(previousSlug));
  }
  return [...paths];
}

export const revalidatePage: CollectionAfterChangeHook<Page> = ({ doc, previousDoc, req }) => {
  if (req.context?.disableRevalidate) return doc;

  const paths = pathsToRevalidate({
    slug: doc.slug,
    status: doc._status,
    previousSlug: previousDoc?.slug,
    previousStatus: previousDoc?._status,
  });

  for (const path of paths) {
    req.payload.logger.info(`Revalidating ${path}`);
    revalidatePath(path);
  }

  // The list of pages itself changed, so the sitemap is stale too.
  if (paths.length > 0) revalidatePath('/sitemap.xml');

  return doc;
};

export const revalidatePageAfterDelete: CollectionAfterDeleteHook<Page> = ({ doc, req }) => {
  if (req.context?.disableRevalidate) return doc;
  revalidatePath(pathForSlug(doc?.slug));
  revalidatePath('/sitemap.xml');
  return doc;
};
