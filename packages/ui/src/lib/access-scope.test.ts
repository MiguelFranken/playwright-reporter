import { describe, expect, it } from 'vitest';
import { accessScopeItems, parseAccessScope } from './access-scope';

describe('accessScopeItems', () => {
  const teams = [{ value: 't1', label: 'Acme' }];
  const projects = [{ value: 'p1', label: 'acme/web' }];

  it('lists all teams, then each team, then each project', () => {
    expect(accessScopeItems({ teams, projects, isSuperadmin: false })).toEqual([
      { value: 'all', label: 'All teams I belong to' },
      { value: 'team:t1', label: 'Team: Acme' },
      { value: 'project:p1', label: 'Project: acme/web' },
    ]);
  });

  it('offers every team to superadmins only', () => {
    expect(accessScopeItems({ teams: [], projects: [], isSuperadmin: true }).map((i) => i.value)).toEqual(['all', 'superadmin']);
  });
});

describe('parseAccessScope', () => {
  it('round-trips every item', () => {
    expect(parseAccessScope('all')).toEqual({ kind: 'all' });
    expect(parseAccessScope('superadmin')).toEqual({ kind: 'superadmin' });
    expect(parseAccessScope('team:t1')).toEqual({ kind: 'team', teamId: 't1' });
    expect(parseAccessScope('project:p1')).toEqual({ kind: 'project', projectId: 'p1' });
  });

  it('falls back to all teams for anything else', () => {
    expect(parseAccessScope('')).toEqual({ kind: 'all' });
  });
});
