/** Reserved because they would collide with top-level routes or look official. */
const RESERVED = new Set(['admin', 'api', 'login', 'logout', 'invite', 'account', 'teams', 'projects', 'new', 'settings', 'static', '_next']);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export type SlugError = string | null;

export function validateSlug(slug: string, kind: 'team' | 'project'): SlugError {
  if (!SLUG_RE.test(slug)) {
    return 'Use 1–50 lowercase letters, digits and dashes; it must start and end with a letter or digit.';
  }
  if (kind === 'team' && RESERVED.has(slug)) return `"${slug}" is reserved.`;
  return null;
}

export { slugify } from '@miguelfranken/ui/lib/slug';
