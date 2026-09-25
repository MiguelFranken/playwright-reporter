/**
 * The team roles as the UI names them. The app's permission model owns the
 * roles themselves; it re-exports these maps and fails `check-types` if the two
 * sets ever differ.
 */
export type TeamRole = 'admin' | 'member' | 'viewer';

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  admin: 'Full access to the team: projects, tokens, members and invitations.',
  member: 'Can operate projects: rename, manage tokens, delete runs.',
  viewer: 'Read-only. Cannot see or create ingest tokens.',
};

export const TEAM_ROLE_ITEMS = (Object.keys(TEAM_ROLE_LABELS) as TeamRole[]).map((value) => ({ value, label: TEAM_ROLE_LABELS[value] }));
