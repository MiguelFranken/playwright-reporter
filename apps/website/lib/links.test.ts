import { describe, expect, it } from 'vitest';
import { isExternalHref, pathForSlug, resolveLink, resolveLinks, type CmsLink } from './links';
import type { Page } from '@/payload-types';

/** A page document, populated the way `depth: 2` returns it. */
function page(slug: string): Page {
  return { id: 1, title: slug, slug, layout: [], updatedAt: '', createdAt: '' } as Page;
}

describe('pathForSlug', () => {
  it('maps the reserved home slug to the site root', () => {
    expect(pathForSlug('home')).toBe('/');
  });

  it('falls back to the root when the slug is missing', () => {
    expect(pathForSlug(null)).toBe('/');
    expect(pathForSlug(undefined)).toBe('/');
  });

  it('keeps nested slugs', () => {
    expect(pathForSlug('legal/imprint')).toBe('/legal/imprint');
  });

  it('does not double the leading slash', () => {
    expect(pathForSlug('/features')).toBe('/features');
  });
});

describe('isExternalHref', () => {
  it.each([
    ['https://github.com/acme', true],
    ['mailto:hello@example.com', true],
    ['/features', false],
    ['/legal/imprint', false],
  ])('%s → %s', (href, expected) => {
    expect(isExternalHref(href)).toBe(expected);
  });
});

describe('resolveLink', () => {
  it('resolves an internal link through the referenced page', () => {
    const link: CmsLink = { type: 'internal', reference: page('features'), label: 'Features' };
    expect(resolveLink(link)).toEqual({
      href: '/features',
      label: 'Features',
      external: false,
      appearance: undefined,
    });
  });

  it('resolves the home page to the root', () => {
    const link: CmsLink = { type: 'internal', reference: page('home'), label: 'Home' };
    expect(resolveLink(link)?.href).toBe('/');
  });

  it('drops an internal link whose reference was not populated', () => {
    // depth 0 returns the id rather than the document; a path cannot be built.
    expect(resolveLink({ type: 'internal', reference: 7, label: 'Features' })).toBeNull();
  });

  it('drops an internal link whose page was deleted', () => {
    expect(resolveLink({ type: 'internal', reference: null, label: 'Features' })).toBeNull();
  });

  it('marks an absolute custom URL as external', () => {
    const resolved = resolveLink({ type: 'custom', url: 'https://github.com/acme', label: 'GitHub' });
    expect(resolved).toMatchObject({ href: 'https://github.com/acme', external: true });
  });

  it('treats a relative custom URL as internal', () => {
    expect(resolveLink({ type: 'custom', url: '/features', label: 'Features' })?.external).toBe(false);
  });

  it('honours an explicit new tab on a relative URL', () => {
    const resolved = resolveLink({ type: 'custom', url: '/features', label: 'F', newTab: true });
    expect(resolved?.external).toBe(true);
  });

  it('drops a link with no label', () => {
    // The standalone link on a section is usually left empty by the editor.
    expect(resolveLink({ type: 'custom', url: '/features' })).toBeNull();
  });

  it('drops a custom link with no URL', () => {
    expect(resolveLink({ type: 'custom', label: 'Nowhere' })).toBeNull();
  });

  it('carries the appearance through', () => {
    const resolved = resolveLink({
      type: 'custom',
      url: '/get-started',
      label: 'Get started',
      appearance: 'primary',
    });
    expect(resolved?.appearance).toBe('primary');
  });
});

describe('resolveLinks', () => {
  it('drops the entries that cannot resolve and keeps the rest', () => {
    const resolved = resolveLinks([
      { link: { type: 'custom', url: '/features', label: 'Features' } },
      { link: { type: 'internal', reference: null, label: 'Gone' } },
      { link: { type: 'custom', url: '/compare', label: 'Compare' } },
    ]);
    expect(resolved.map((link) => link.href)).toEqual(['/features', '/compare']);
  });

  it('is empty for an empty field', () => {
    expect(resolveLinks(null)).toEqual([]);
    expect(resolveLinks(undefined)).toEqual([]);
  });
});
