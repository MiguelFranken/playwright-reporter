import { describe, expect, it } from 'vitest';
import { roleCan, statements, teamRoles, type EffectiveRole, type Permission } from './permissions';

/**
 * The matrix is asserted row by row so that widening a role is always a
 * deliberate diff in this file, never a side effect of an edit elsewhere.
 */
const EXPECTED: Record<EffectiveRole, Partial<Record<keyof typeof statements, string[]>>> = {
  admin: {
    team: ['read', 'update'],
    member: ['read', 'invite', 'update-role', 'remove'],
    project: ['read', 'create', 'update', 'delete'],
    token: ['read', 'create', 'revoke'],
    run: ['read', 'delete'],
    artifact: ['read'],
    audit: ['read'],
  },
  member: {
    team: ['read'],
    member: ['read'],
    project: ['read', 'update'],
    token: ['read', 'create', 'revoke'],
    run: ['read', 'delete'],
    artifact: ['read'],
  },
  viewer: {
    team: ['read'],
    member: ['read'],
    project: ['read'],
    run: ['read'],
    artifact: ['read'],
  },
  superadmin: Object.fromEntries(Object.entries(statements).map(([k, v]) => [k, [...v]])) as Record<string, string[]>,
};

const ROLES = Object.keys(EXPECTED) as EffectiveRole[];

describe('permission matrix', () => {
  for (const role of ROLES) {
    describe(role, () => {
      for (const [resource, actions] of Object.entries(statements)) {
        for (const action of actions) {
          const allowed = EXPECTED[role][resource as keyof typeof statements]?.includes(action) ?? false;
          it(`${allowed ? 'allows' : 'denies'} ${resource}:${action}`, () => {
            expect(roleCan(role, { [resource]: [action] } as Permission)).toBe(allowed);
          });
        }
      }
    });
  }

  it('requires every action in a multi-action request', () => {
    expect(roleCan('admin', { project: ['read', 'delete'] })).toBe(true);
    expect(roleCan('member', { project: ['read', 'delete'] })).toBe(false);
    expect(roleCan('member', { project: ['read', 'update'] })).toBe(true);
  });

  it('requires every resource in a multi-resource request', () => {
    expect(roleCan('admin', { project: ['read'], token: ['create'] })).toBe(true);
    expect(roleCan('viewer', { project: ['read'], token: ['create'] })).toBe(false);
  });

  it('treats an empty permission as satisfied', () => {
    expect(roleCan('viewer', {})).toBe(true);
  });

  it('keeps superadmin above every team role', () => {
    for (const [resource, actions] of Object.entries(statements)) {
      expect(roleCan('superadmin', { [resource]: [...actions] } as Permission)).toBe(true);
    }
  });

  it('hides ingest tokens from viewers', () => {
    expect(roleCan('viewer', { token: ['read'] })).toBe(false);
    expect(roleCan('member', { token: ['read'] })).toBe(true);
  });

  it('never lets a team admin delete the team', () => {
    expect(roleCan('admin', { team: ['delete'] })).toBe(false);
    expect(roleCan('superadmin', { team: ['delete'] })).toBe(true);
  });

  it('exposes the admin plugin statements so superadmins pass adminMiddleware', () => {
    expect(statements.user).toContain('set-password');
    expect(statements.session).toContain('revoke');
    expect(roleCan('superadmin', { user: ['ban', 'set-password'] })).toBe(true);
    expect(roleCan('admin', { user: ['ban'] })).toBe(false);
  });

  it('defines exactly the three team roles', () => {
    expect(Object.keys(teamRoles).sort()).toEqual(['admin', 'member', 'viewer']);
  });
});
