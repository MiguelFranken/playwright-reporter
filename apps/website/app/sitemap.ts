import type { MetadataRoute } from 'next';
import { queryPublishedPages } from '@/lib/queries';

const serverURL = process.env.BASE_URL ?? 'http://localhost:3001';

/** Published pages only; the `revalidatePage` hook refreshes this on publish. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await queryPublishedPages();
  return pages.map((page) => ({
    url: `${serverURL}${page.slug === 'home' ? '' : `/${page.slug}`}`,
    lastModified: page.updatedAt ? new Date(page.updatedAt) : undefined,
    priority: page.slug === 'home' ? 1 : 0.7,
  }));
}
