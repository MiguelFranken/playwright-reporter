import { describe, expect, it } from 'vitest';
import { activeTeam, currentWorkspace, isActivePath, parseWorkspace, serializeWorkspace, workspaceFromPath } from './nav';

const TEAMS = [{ slug: 'acme' }, { slug: 'platform' }];

describe('workspaceFromPath', () => {
  it('reads the team and project from a team route', () => {
    expect(workspaceFromPath('/teams/platform/projects/api/runs')).toEqual({ team: 'platform', project: 'api' });
    expect(workspaceFromPath('/teams/platform/settings/members')).toEqual({ team: 'platform' });
    expect(workspaceFromPath('/teams/platform')).toEqual({ team: 'platform' });
  });

  it('is null off team routes', () => {
    expect(workspaceFromPath('/admin/users')).toBeNull();
    expect(workspaceFromPath('/account')).toBeNull();
    expect(workspaceFromPath('/teams/')).toBeNull();
  });
});

describe('currentWorkspace', () => {
  it('prefers the URL, and keeps the last workspace off team routes', () => {
    const last = { team: 'platform', project: 'api' };
    expect(currentWorkspace('/teams/acme', last)).toEqual({ team: 'acme' });
    expect(currentWorkspace('/admin/users', last)).toBe(last);
    expect(currentWorkspace('/admin/users')).toBeNull();
  });
});

describe('activeTeam', () => {
  it('reads the team from a team route', () => {
    expect(activeTeam('/teams/platform/projects/api/runs', TEAMS)).toEqual({ slug: 'platform' });
  });

  it('keeps the last team off team routes', () => {
    expect(activeTeam('/admin/users', TEAMS, { team: 'platform', project: 'api' })).toEqual({ slug: 'platform' });
  });

  it('falls back to the first team with nothing to go on and for unknown slugs', () => {
    expect(activeTeam('/admin/users', TEAMS)).toEqual({ slug: 'acme' });
    expect(activeTeam('/admin/users', TEAMS, { team: 'gone' })).toEqual({ slug: 'acme' });
    expect(activeTeam('/teams/gone', TEAMS)).toEqual({ slug: 'acme' });
  });

  it('is null without teams', () => {
    expect(activeTeam('/account', [])).toBeNull();
  });
});

describe('serializeWorkspace / parseWorkspace', () => {
  it('round-trips', () => {
    for (const ws of [{ team: 'acme' }, { team: 'acme', project: 'web' }, { team: 'a/b', project: 'c d' }]) {
      expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws);
    }
  });

  it('rejects malformed values', () => {
    for (const value of [undefined, '', 'a/b/c', '/web', 'acme/', '%E0%A4%A']) expect(parseWorkspace(value)).toBeNull();
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
