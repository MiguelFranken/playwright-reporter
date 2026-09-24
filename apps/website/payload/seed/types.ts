import type { RequiredDataFromCollectionSlug } from 'payload';

export type PageData = RequiredDataFromCollectionSlug<'pages'>;

/**
 * Slug → document id, filled in by the seed's first pass.
 *
 * Internal links store a relationship rather than a path, so the pages have to
 * exist before the links between them can be written. Hence two passes.
 */
export type PageIds = Record<string, number>;

/** Slug → uploaded media id, for the screenshots the seed uploads. */
export type MediaIds = Record<string, number>;

export interface SeedContext {
  pages: PageIds;
  media: MediaIds;
}

/** An internal link to a seeded page. */
export function internal(ctx: SeedContext, slug: string, label: string, appearance?: string) {
  return {
    type: 'internal' as const,
    reference: ctx.pages[slug] ?? null,
    label,
    ...(appearance ? { appearance: appearance as 'primary' } : {}),
  };
}

/** An external link — GitHub, the docs placeholder, a mailto: address. */
export function external(url: string, label: string, appearance?: string) {
  return {
    type: 'custom' as const,
    url,
    label,
    newTab: true,
    ...(appearance ? { appearance: appearance as 'primary' } : {}),
  };
}

export const GITHUB_URL = 'https://github.com/mfranken/playwright-reporter';
/** Replaced with the Mintlify site's URL once it exists (WEBSITE.md §2). */
export const DOCS_URL = 'https://github.com/mfranken/playwright-reporter#readme';
