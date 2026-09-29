/**
 * The sidebar's model. The chrome is rendered by one layout shared across every
 * section, so it is never re-rendered on navigation and cannot be handed the
 * route's params. Instead it gets every team the user may open and works out
 * the active one from the URL — which is why moving between teams, projects
 * and administration never re-streams the sidebar.
 */

export type SidebarProject = { slug: string; name: string };
export type SidebarTeam = { slug: string; name: string; image: string | null; canManage: boolean; projects: SidebarProject[] };
export type SidebarUser = { name: string; email: string; image: string | null; isSuperadmin: boolean };

/** A place in the workspace: a team, and the project inside it if any. */
export type Workspace = { team: string; project?: string };

/** The team and project a team route points at; `null` off team routes (`/admin`, `/account`). */
export function workspaceFromPath(pathname: string): Workspace | null {
  if (!pathname.startsWith('/teams/')) return null;
  const [, , team, section, project] = pathname.split('/');
  if (!team) return null;
  return section === 'projects' && project ? { team, project } : { team };
}

/**
 * The workspace the chrome shows. On a team route that is the URL's; off one
 * (`/admin`, `/account`) there is nothing to read, so the chrome keeps the team
 * and project you were last in — opening administration is a detour, not a
 * switch to another team.
 */
export function currentWorkspace(pathname: string, last: Workspace | null = null): Workspace | null {
  return workspaceFromPath(pathname) ?? last;
}

/**
 * The team the chrome shows (see `currentWorkspace`). With nothing to go on —
 * a first visit straight to `/admin`, an unknown slug — the first team stands
 * in so the sidebar keeps its shape instead of collapsing to an admin-only menu.
 */
export function activeTeam<T extends { slug: string }>(pathname: string, teams: T[], last: Workspace | null = null): T | null {
  const slug = currentWorkspace(pathname, last)?.team;
  return teams.find((t) => t.slug === slug) ?? teams[0] ?? null;
}

/** `team` or `team/project`, each part URI-encoded — how a workspace is remembered between visits. */
export function serializeWorkspace(workspace: Workspace): string {
  const team = encodeURIComponent(workspace.team);
  return workspace.project ? `${team}/${encodeURIComponent(workspace.project)}` : team;
}

/** The inverse of `serializeWorkspace`; anything malformed is `null`. */
export function parseWorkspace(value: string | undefined | null): Workspace | null {
  if (!value) return null;
  const parts = value.split('/');
  if (parts.length > 2 || parts.some((p) => !p)) return null;
  try {
    const [team, project] = parts.map(decodeURIComponent) as [string, string | undefined];
    return project ? { team, project } : { team };
  } catch {
    return null;
  }
}

/** `exact` matters for section roots like `/admin`, which every child extends. */
export function isActivePath(pathname: string, href: string, exact = false) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
