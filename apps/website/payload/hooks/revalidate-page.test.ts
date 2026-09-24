import { describe, expect, it } from 'vitest';
import { pathForSlug, pathsToRevalidate } from './revalidate-page';

describe('pathForSlug', () => {
  it('maps home to the site root', () => {
    expect(pathForSlug('home')).toBe('/');
    expect(pathForSlug(undefined)).toBe('/');
    expect(pathForSlug('features')).toBe('/features');
  });
});

/**
 * The decision table this hook exists for: a publish has to refresh the new
 * path, and an unpublish or a rename has to refresh the *old* one too, or the
 * previous URL keeps serving a page that no longer lives there.
 */
describe('pathsToRevalidate', () => {
  it('revalidates the path on first publish', () => {
    expect(pathsToRevalidate({ slug: 'features', status: 'published' })).toEqual(['/features']);
  });

  it('revalidates once when a published page is edited and republished', () => {
    expect(
      pathsToRevalidate({
        slug: 'features',
        status: 'published',
        previousSlug: 'features',
        previousStatus: 'published',
      }),
    ).toEqual(['/features']);
  });

  it('revalidates the old path when a page is unpublished', () => {
    expect(
      pathsToRevalidate({
        slug: 'features',
        status: 'draft',
        previousSlug: 'features',
        previousStatus: 'published',
      }),
    ).toEqual(['/features']);
  });

  it('revalidates both paths when a published page is renamed', () => {
    expect(
      pathsToRevalidate({
        slug: 'capabilities',
        status: 'published',
        previousSlug: 'features',
        previousStatus: 'published',
      }),
    ).toEqual(['/capabilities', '/features']);
  });

  it('does nothing while a page is still an unpublished draft', () => {
    expect(pathsToRevalidate({ slug: 'features', status: 'draft' })).toEqual([]);
  });

  it('does nothing when a draft is saved again', () => {
    expect(
      pathsToRevalidate({
        slug: 'features',
        status: 'draft',
        previousSlug: 'features',
        previousStatus: 'draft',
      }),
    ).toEqual([]);
  });

  it('revalidates the site root for the home page', () => {
    expect(pathsToRevalidate({ slug: 'home', status: 'published' })).toEqual(['/']);
  });
});
