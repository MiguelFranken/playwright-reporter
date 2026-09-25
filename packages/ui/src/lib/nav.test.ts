import { describe, expect, it } from 'vitest';
import { activeTeam, isActivePath } from './nav';

const TEAMS = [{ slug: 'acme' }, { slug: 'platform' }];

describe('activeTeam', () => {
  it('reads the team from a team route', () => {
    expect(activeTeam('/teams/platform/projects/api/runs', TEAMS)).toEqual({ slug: 'platform' });
  });

  it('falls back to the first team off team routes and for unknown slugs', () => {
    expect(activeTeam('/admin/users', TEAMS)).toEqual({ slug: 'acme' });
    expect(activeTeam('/teams/gone', TEAMS)).toEqual({ slug: 'acme' });
  });

  it('is null without teams', () => {
    expect(activeTeam('/account', [])).toBeNull();
  });
});

describe('isActivePath', () => {
  it('matches the path and everything under it', () => {
    expect(isActivePath('/admin/users', '/admin')).toBe(true);
    expect(isActivePath('/administration', '/admin')).toBe(false);
  });

  it('matches only the path itself when exact', () => {
    expect(isActivePath('/admin/users', '/admin', true)).toBe(false);
    expect(isActivePath('/admin', '/admin', true)).toBe(true);
  });
});
