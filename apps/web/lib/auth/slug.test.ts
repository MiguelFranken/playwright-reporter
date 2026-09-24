import { describe, expect, it } from 'vitest';
import { slugify, validateSlug } from './slug';

describe('validateSlug', () => {
  it('accepts lowercase, digits and inner dashes', () => {
    for (const slug of ['a', 'web', 'web-app', 'team-42', 'a1']) {
      expect(validateSlug(slug, 'project')).toBeNull();
    }
  });

  it('rejects shapes that would break URLs', () => {
    for (const slug of ['', '-web', 'web-', 'Web', 'web app', 'web/app', 'web_app', 'ä', 'x'.repeat(51)]) {
      expect(validateSlug(slug, 'project')).not.toBeNull();
    }
  });

  it('reserves team slugs that collide with top-level routes', () => {
    for (const slug of ['admin', 'api', 'login', 'invite', 'account', 'teams']) {
      expect(validateSlug(slug, 'team')).not.toBeNull();
      // Project slugs are namespaced under a team, so they are free to use.
      expect(validateSlug(slug, 'project')).toBeNull();
    }
  });
});

describe('slugify', () => {
  it('turns a display name into a usable slug', () => {
    expect(slugify('Default team')).toBe('default-team');
    expect(slugify('  Web App!  ')).toBe('web-app');
    expect(slugify('A/B Testing')).toBe('a-b-testing');
  });

  it('produces something validateSlug accepts, or nothing at all', () => {
    for (const name of ['Default team', 'Web App!', '123', 'Ümlaut Team']) {
      const slug = slugify(name);
      if (slug) expect(validateSlug(slug, 'project')).toBeNull();
    }
  });
});
