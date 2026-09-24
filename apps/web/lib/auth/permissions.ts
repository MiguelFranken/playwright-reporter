/**
 * The whole authorization model, as data. Everything the UI hides is also
 * enforced by the access layer (`lib/auth/access.ts`); hiding is convenience,
 * the server check is the security boundary.
 *
 * `createAccessControl` is a pure helper — typed statements plus
 * `role.authorize()` — with no runtime dependency on any plugin.
 */
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';

export const statements = {
  // `user` and `session` come from the admin plugin and gate its own endpoints
  // (list users, set role, ban, set password). Keep them so a superadmin role
  // built here still satisfies `adminMiddleware`.
  ...defaultStatements,
  team: ['read', 'update', 'delete'],
  member: ['read', 'invite', 'update-role', 'remove'],
  project: ['read', 'create', 'update', 'delete'],
  token: ['read', 'create', 'revoke'],
  run: ['read', 'delete'],
  artifact: ['read'],
  audit: ['read'],
} as const;

export const ac = createAccessControl(statements);

export const teamRoles = {
  admin: ac.newRole({
    team: ['read', 'update'], // deleting a team is superadmin-only
    member: ['read', 'invite', 'update-role', 'remove'],
    project: ['read', 'create', 'update', 'delete'],
    token: ['read', 'create', 'revoke'],
    run: ['read', 'delete'],
    artifact: ['read'],
    audit: ['read'],
  }),
  member: ac.newRole({
    team: ['read'],
    member: ['read'],
    project: ['read', 'update'],
    token: ['read', 'create', 'revoke'],
    run: ['read', 'delete'],
    artifact: ['read'],
  }),
  viewer: ac.newRole({
    team: ['read'],
    member: ['read'],
    project: ['read'],
    run: ['read'],
    artifact: ['read'],
  }),
} as const;

/** Instance roles for the admin plugin. A superadmin holds every statement. */
export const superadminRole = ac.newRole(
  Object.fromEntries(Object.entries(statements).map(([resource, actions]) => [resource, [...actions]])) as never,
);
export const userRole = ac.newRole({});

export type TeamRoleName = keyof typeof teamRoles;
export type EffectiveRole = TeamRoleName | 'superadmin';
export type Permission = { [R in keyof typeof statements]?: readonly (typeof statements)[R][number][] };

const roles = { ...teamRoles, superadmin: superadminRole } satisfies Record<EffectiveRole, unknown>;

/** True when `role` holds every action listed in `permission`. */
export function roleCan(role: EffectiveRole, permission: Permission): boolean {
  const entries = Object.entries(permission).filter(([, actions]) => actions && actions.length > 0);
  if (entries.length === 0) return true;
  return roles[role].authorize(Object.fromEntries(entries) as never).success === true;
}

export const TEAM_ROLE_LABELS: Record<TeamRoleName, string> = {
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRoleName, string> = {
  admin: 'Full access to the team: projects, tokens, members and invitations.',
  member: 'Can operate projects: rename, manage tokens, delete runs.',
  viewer: 'Read-only. Cannot see or create ingest tokens.',
};
