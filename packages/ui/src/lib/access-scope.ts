/**
 * The "Access" choice an assistant gets, shared by the token dialog and the
 * OAuth consent screen: all of the viewer's teams, every team (superadmins
 * only), one team, or one project. The value is a flat string so it fits a
 * Select and a form field; `parseAccessScope` turns it back into its parts.
 */

export interface AccessScopeOption {
  /** A team or project id. */
  value: string;
  label: string;
}

export type AccessScope = { kind: 'all' } | { kind: 'superadmin' } | { kind: 'team'; teamId: string } | { kind: 'project'; projectId: string };

export const DEFAULT_ACCESS_SCOPE = 'all';

export function accessScopeItems({
  teams,
  projects,
  isSuperadmin,
}: {
  teams: AccessScopeOption[];
  projects: AccessScopeOption[];
  isSuperadmin: boolean;
}): { value: string; label: string }[] {
  return [
    { value: 'all', label: 'All teams I belong to' },
    ...(isSuperadmin ? [{ value: 'superadmin', label: 'Every team (superadmin)' }] : []),
    ...teams.map((t) => ({ value: `team:${t.value}`, label: `Team: ${t.label}` })),
    ...projects.map((p) => ({ value: `project:${p.value}`, label: `Project: ${p.label}` })),
  ];
}

export function parseAccessScope(value: string): AccessScope {
  if (value.startsWith('team:')) return { kind: 'team', teamId: value.slice(5) };
  if (value.startsWith('project:')) return { kind: 'project', projectId: value.slice(8) };
  if (value === 'superadmin') return { kind: 'superadmin' };
  return { kind: 'all' };
}
