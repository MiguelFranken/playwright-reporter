import type { MarketingLink } from '@repo/ui/lib/marketing';
import type { Page } from '@/payload-types';

/**
 * The CMS shape of a link. Written out rather than imported from
 * `payload-types` because the same group appears inside a dozen generated
 * block interfaces under a dozen different names, all structurally identical.
 */
export interface CmsLink {
  type?: ('internal' | 'custom') | null;
  newTab?: boolean | null;
  reference?: (number | null) | Page;
  url?: string | null;
  /**
   * Optional, because the standalone link on a section is usually left empty.
   * `resolveLink` drops a link without one rather than rendering a blank CTA.
   */
  label?: string | null;
  appearance?: ('primary' | 'secondary' | 'ghost' | 'link') | null;
}

/** `home` is the reserved slug for `/`. */
export function pathForSlug(slug: string | null | undefined): string {
  if (!slug || slug === 'home') return '/';
  return `/${slug.replace(/^\/+/, '')}`;
}

/**
 * A link is external when it leaves this origin. `mailto:` counts: it leaves
 * the page, so it gets the same treatment in the UI.
 */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('/');
}

/**
 * Resolves a CMS link to something the design system can render.
 *
 * Internal links resolve through the referenced page's slug at render time
 * rather than storing a path, so renaming a page does not leave dead links
 * behind it. A reference that was not populated (depth 0) or points at a
 * deleted page yields `null`, and the caller drops the link rather than
 * rendering one that goes nowhere.
 */
export function resolveLink(link: CmsLink | null | undefined): MarketingLink | null {
  if (!link?.label) return null;

  if (link.type === 'custom') {
    if (!link.url) return null;
    return {
      href: link.url,
      label: link.label,
      external: link.newTab === true || isExternalHref(link.url),
      appearance: link.appearance ?? undefined,
    };
  }

  const reference = link.reference;
  if (!reference || typeof reference === 'number') return null;

  return {
    href: pathForSlug(reference.slug),
    label: link.label,
    external: link.newTab === true,
    appearance: link.appearance ?? undefined,
  };
}

/** Resolves a `linkGroup` array, dropping the entries that cannot resolve. */
export function resolveLinks(
  links: { link: CmsLink; id?: string | null }[] | null | undefined,
): MarketingLink[] {
  if (!links) return [];
  return links.map((entry) => resolveLink(entry.link)).filter((link): link is MarketingLink => link !== null);
}
