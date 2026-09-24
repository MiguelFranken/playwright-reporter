/**
 * The session-free core of the access layer: "may this *principal* touch that
 * team or project". A principal is a user plus, for machine callers, the grant
 * they came in with (a personal access token today, an OAuth grant later).
 *
 * `access.ts` wraps these for browser sessions (`grant: null`), so pages and
 * route handlers keep their API. The MCP server calls them directly with the
 * principal its bearer token resolved to — it has no Better Auth session and
 * must never read `headers()` for identity.
 *
 * Effective access is the intersection of what the user may do *right now*
 * (live membership and role) and what the grant is restricted to, so removing
 * somebody from a team takes effect on their tokens immediately.
 */
import 'server-only';
import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, runs, teamMembers, teams, type Project, type Team } from '@/lib/db/schema';
import { roleCan, type EffectiveRole, type Permission } from './permissions';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  isSuperadmin: boolean;
};

export type GrantScope = 'read' | 'write';

/** What a machine credential is restricted to. `null` on a principal means a browser session. */
export type Grant = {
  kind: 'pat' | 'oauth';
  /** Token or grant id, for logging and `last_used_at`. */
  id: string;
  scopes: readonly GrantScope[];
  /** `null` = every team the user can see. */
  teamIds: readonly string[] | null;
  /** Pins the grant to one project. */
  projectId: string | null;
  /** Superadmin-only opt-in to keep the virtual superadmin role across all teams. */
  allTeams: boolean;
};

export type Principal = { user: CurrentUser; grant: Grant | null };

export type TeamAccess = {
  user: CurrentUser;
  team: Team;
  role: EffectiveRole;
  can: (permission: Permission) => boolean;
};

export type ProjectAccess = TeamAccess & { project: Project };

/**
 * A superadmin keeps their instance-wide role on a session, and on a grant only
 * when it explicitly opted in. Everyday tokens of a superadmin see exactly what
 * their memberships show, so a leaked one does not expose the whole instance.
 */
export function actsAsSuperadmin(p: Principal): boolean {
  return p.user.isSuperadmin && (p.grant === null || p.grant.allTeams);
}

/** Pure part of the check, shared by every resolver (and unit-tested on its own). */
export function effectiveRole(p: Principal, teamId: string, membershipRole: EffectiveRole | null): EffectiveRole | null {
  if (p.grant?.teamIds && !p.grant.teamIds.includes(teamId)) return null;
  if (actsAsSuperadmin(p)) return 'superadmin';
  return membershipRole;
}

function toAccess(p: Principal, team: Team, role: EffectiveRole): TeamAccess {
  return { user: p.user, team, role, can: (permission) => roleCan(role, permission) };
}

export async function resolveTeamFor(p: Principal, teamSlug: string): Promise<TeamAccess | null> {
  const [row] = await db
    .select({ team: teams, role: teamMembers.role })
    .from(teams)
    .leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, p.user.id)))
    .where(eq(teams.slug, teamSlug))
    .limit(1);
  if (!row) return null;
  const role = effectiveRole(p, row.team.id, row.role ?? null);
  return role ? toAccess(p, row.team, role) : null;
}

export async function resolveProjectFor(p: Principal, teamSlug: string, projectSlug: string): Promise<ProjectAccess | null> {
  const access = await resolveTeamFor(p, teamSlug);
  if (!access) return null;
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.teamId, access.team.id), eq(projects.slug, projectSlug)))
    .limit(1);
  if (!project) return null;
  if (p.grant?.projectId && project.id !== p.grant.projectId) return null;
  return { ...access, project };
}

export async function resolveProjectByIdFor(p: Principal, projectId: string): Promise<ProjectAccess | null> {
  const [row] = await db
    .select({ project: projects, team: teams, role: teamMembers.role })
    .from(projects)
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, p.user.id)))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) return null;
  if (p.grant?.projectId && row.project.id !== p.grant.projectId) return null;
  const role = effectiveRole(p, row.team.id, row.role ?? null);
  return role ? { ...toAccess(p, row.team, role), project: row.project } : null;
}

export type AccessibleProject = {
  team: Pick<Team, 'id' | 'slug' | 'name'>;
  project: Pick<Project, 'id' | 'slug' | 'name'>;
  role: EffectiveRole;
  lastRunAt: Date | null;
};

/**
 * Every project the principal can read, newest activity first. Used for
 * discovery (`whoami`), for the "which project did you mean" error, and for
 * matching a git remote to a project.
 */
export async function listAccessibleProjects(p: Principal): Promise<AccessibleProject[]> {
  const superadmin = actsAsSuperadmin(p);
  const membership = db
    .select({ teamId: teamMembers.teamId, role: teamMembers.role })
    .from(teamMembers)
    .where(eq(teamMembers.userId, p.user.id))
    .as('membership');
  const lastRun = db
    .select({ projectId: runs.projectId, lastRunAt: max(runs.startedAt).as('last_run_at') })
    .from(runs)
    .groupBy(runs.projectId)
    .as('last_run');

  const rows = await db
    .select({
      team: { id: teams.id, slug: teams.slug, name: teams.name },
      project: { id: projects.id, slug: projects.slug, name: projects.name },
      role: membership.role,
      lastRunAt: lastRun.lastRunAt,
    })
    .from(projects)
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .leftJoin(membership, eq(membership.teamId, teams.id))
    .leftJoin(lastRun, eq(lastRun.projectId, projects.id))
    .where(
      and(
        superadmin ? undefined : sql`${membership.role} is not null`,
        p.grant?.teamIds ? (p.grant.teamIds.length ? inArray(teams.id, [...p.grant.teamIds]) : sql`false`) : undefined,
        p.grant?.projectId ? eq(projects.id, p.grant.projectId) : undefined,
      ),
    )
    .orderBy(sql`${lastRun.lastRunAt} desc nulls last`, asc(teams.slug), asc(projects.slug));

  return rows.flatMap((row) => {
    const role = effectiveRole(p, row.team.id, row.role ?? null);
    if (!role) return [];
    return [{ team: row.team, project: row.project, role, lastRunAt: row.lastRunAt ? new Date(row.lastRunAt) : null }];
  });
}

/** Teams a principal can see, for validating token restrictions at creation time. */
export async function listAccessibleTeamIds(p: Principal): Promise<string[]> {
  if (actsAsSuperadmin(p)) {
    const rows = await db.select({ id: teams.id }).from(teams).orderBy(desc(teams.createdAt));
    return rows.map((r) => r.id);
  }
  const rows = await db.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, p.user.id));
  return rows.map((r) => r.id).filter((id) => !p.grant?.teamIds || p.grant.teamIds.includes(id));
}
