import { describe, expect, it } from 'vitest';
import { actsAsSuperadmin, effectiveRole, type Grant, type Principal } from './principal';

const user = { id: 'u1', email: 'a@example.test', name: 'A', image: null, isSuperadmin: false };
const root = { ...user, id: 'root', isSuperadmin: true };
const grant = (overrides: Partial<Grant> = {}): Grant => ({
  kind: 'pat',
  id: 't1',
  scopes: ['read'],
  teamIds: null,
  projectId: null,
  allTeams: false,
  ...overrides,
});

describe('effectiveRole', () => {
  it('uses the membership role for a session', () => {
    const p: Principal = { user, grant: null };
    expect(effectiveRole(p, 'team-a', 'member')).toBe('member');
    expect(effectiveRole(p, 'team-a', null)).toBeNull();
  });

  it('keeps the membership role for an unrestricted token', () => {
    expect(effectiveRole({ user, grant: grant() }, 'team-a', 'viewer')).toBe('viewer');
  });

  it('hides teams outside a token restriction, even with a membership', () => {
    const p: Principal = { user, grant: grant({ teamIds: ['team-a'] }) };
    expect(effectiveRole(p, 'team-a', 'admin')).toBe('admin');
    expect(effectiveRole(p, 'team-b', 'admin')).toBeNull();
  });

  it('gives a superadmin session the virtual role everywhere', () => {
    expect(effectiveRole({ user: root, grant: null }, 'team-a', null)).toBe('superadmin');
  });

  it('limits a superadmin token to memberships unless it opted in to all teams', () => {
    expect(effectiveRole({ user: root, grant: grant() }, 'team-a', null)).toBeNull();
    expect(effectiveRole({ user: root, grant: grant() }, 'team-a', 'viewer')).toBe('viewer');
    expect(effectiveRole({ user: root, grant: grant({ allTeams: true }) }, 'team-a', null)).toBe('superadmin');
  });

  it('applies the team restriction before the superadmin opt-in', () => {
    const p: Principal = { user: root, grant: grant({ allTeams: true, teamIds: ['team-a'] }) };
    expect(effectiveRole(p, 'team-b', null)).toBeNull();
  });
});

describe('actsAsSuperadmin', () => {
  it('ignores allTeams for somebody who is not a superadmin', () => {
    expect(actsAsSuperadmin({ user, grant: grant({ allTeams: true }) })).toBe(false);
  });
});
