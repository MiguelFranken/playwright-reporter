/**
 * The single place that turns a request into "which team/project may this
 * person touch". Rule for reviewers: **no page, Server Action or route handler
 * under `app/` reaches `lib/db/queries` or `lib/db/drizzle` without first
 * getting its ids from here.** Ingest routes are the exception (token auth).
 *
 * Everything returns 404 rather than 403 for a team or project the caller
 * cannot see, so URLs never leak the existence of another team's projects.
 */
import 'server-only';
import { cache } from 'react';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { projects, teamMembers, teams, type Project, type Team } from '@/lib/db/schema';
import { auth } from './auth';
import { roleCan, type EffectiveRole, type Permission } from './permissions';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  isSuperadmin: boolean;
};

export type TeamAccess = {
  user: CurrentUser;
  team: Team;
  role: EffectiveRole;
  can: (permission: Permission) => boolean;
};

export type ProjectAccess = TeamAccess & { project: Project };

/**
 * React `cache` memoizes per request, so a layout, its page and every nested
 * component share one session read. Never wrap this in `use cache`: it reads
 * headers, which is a request-time read.
 */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
    isSuperadmin: user.role === 'superadmin',
  };
});

/** Pages only — route handlers cannot redirect; they use the `*OrError` variants. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireSuperadmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isSuperadmin) notFound();
  return user;
}

/** Team plus the caller's membership in one query. Superadmins get a virtual role. */
export const resolveTeam = cache(async (teamSlug: string): Promise<TeamAccess | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const [row] = await db
    .select({ team: teams, role: teamMembers.role })
    .from(teams)
    .leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, user.id)))
    .where(eq(teams.slug, teamSlug))
    .limit(1);
  if (!row) return null;
  const role: EffectiveRole | null = user.isSuperadmin ? 'superadmin' : (row.role ?? null);
  if (!role) return null;
  return { user, team: row.team, role, can: (p) => roleCan(role, p) };
});

export async function requireTeam(teamSlug: string, permission?: Permission): Promise<TeamAccess> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const access = await resolveTeam(teamSlug);
  if (!access) notFound();
  if (permission && !access.can(permission)) notFound();
  return access;
}

export const resolveProject = cache(async (teamSlug: string, projectSlug: string): Promise<ProjectAccess | null> => {
  const access = await resolveTeam(teamSlug);
  if (!access) return null;
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.teamId, access.team.id), eq(projects.slug, projectSlug)))
    .limit(1);
  if (!project) return null;
  return { ...access, project };
});

export async function requireProject(
  teamSlug: string,
  projectSlug: string,
  permission: Permission = { project: ['read'] },
): Promise<ProjectAccess> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const access = await resolveProject(teamSlug, projectSlug);
  if (!access) notFound();
  if (!access.can(permission)) notFound();
  return access;
}

// ------------------------------------------------------------- route handlers

/** Route handlers cannot `redirect()`/`notFound()`; they get a Response back. */
export class AccessError extends Error {
  constructor(public status: number) {
    super(status === 401 ? 'unauthorized' : 'not found');
  }

  toResponse(headers?: HeadersInit) {
    return new Response(this.message, { status: this.status, headers });
  }
}

export async function requireUserOr401(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AccessError(401);
  return user;
}

/** For handlers that only have a team id, like the avatar route. */
export async function requireTeamIdOr404(teamId: string): Promise<CurrentUser> {
  const user = await requireUserOr401();
  if (user.isSuperadmin) return user;
  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
    .limit(1);
  if (!member || !roleCan(member.role, { team: ['read'] })) throw new AccessError(404);
  return user;
}

export async function requireProjectOr404(
  teamSlug: string,
  projectSlug: string,
  permission: Permission = { project: ['read'] },
): Promise<ProjectAccess> {
  const access = await resolveProject(teamSlug, projectSlug);
  if (!access || !access.can(permission)) throw new AccessError(404);
  return access;
}

// ---------------------------------------------------------------- Server Actions

export type Denied = { ok: false; message: string };

export function actionError(message: string): Denied {
  return { ok: false, message };
}

const DENIED = 'You do not have permission to do that.';

/**
 * Server Actions re-run the access check inside the action — never trust the
 * team/project arguments the client sent. These return a result the form can
 * render instead of throwing a navigation error out of an action.
 */
export async function teamForAction(teamSlug: string, permission: Permission): Promise<TeamAccess | Denied> {
  const access = await resolveTeam(teamSlug);
  if (!access) return actionError('Team not found.');
  if (!access.can(permission)) return actionError(DENIED);
  return access;
}

export async function projectForAction(teamSlug: string, projectSlug: string, permission: Permission): Promise<ProjectAccess | Denied> {
  const access = await resolveProject(teamSlug, projectSlug);
  if (!access) return actionError('Project not found.');
  if (!access.can(permission)) return actionError(DENIED);
  return access;
}

export function denied(value: object): value is Denied {
  return 'ok' in value && value.ok === false;
}
