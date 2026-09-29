/**
 * The single place that turns a request into "which team/project may this
 * person touch". Rule for reviewers: **no page, Server Action or route handler
 * under `app/` reaches `lib/db/queries` or `lib/db/drizzle` without first
 * getting its ids from here (or from `principal.ts`, for bearer-token callers
 * such as the MCP server).** Ingest routes are the exception (token auth).
 *
 * The checks themselves live in `principal.ts`; this module binds them to the
 * Better Auth session of the current request.
 *
 * Everything returns 404 rather than 403 for a team or project the caller
 * cannot see, so URLs never leak the existence of another team's projects.
 */
import 'server-only';
import { cache } from 'react';
import { and, eq } from 'drizzle-orm';
import { cacheLife } from 'next/cache';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { auth } from './auth';
import { roleCan, type Permission } from './permissions';
import { resolveProjectFor, resolveTeamFor, type CurrentUser, type ProjectAccess, type TeamAccess } from './principal';

export type { CurrentUser, ProjectAccess, TeamAccess } from './principal';

/**
 * How long the browser may keep what a session was allowed to see.
 *
 * Session and access reads are `'use cache: private'`: never stored on the
 * server, deduplicated within one request, and kept by the client router for
 * `stale` seconds. That is what lets a per-link prefetch (`<Link prefetch>`,
 * see `components/prefetch-link.tsx`) render a page *past* its access check
 * before the click — an uncached read would stop the prefetch right there.
 *
 * Thirty seconds is the shortest lifetime Next.js still includes in a per-link
 * prefetch, and the same window as `staleTimes.dynamic`. Every server request,
 * Server Action and route handler still checks afresh; only a page this tab
 * already holds may outlive a revoked membership, for at most this long.
 * Sign-in and sign-out call `router.refresh()`, which empties that cache.
 */
const SESSION_CACHE = { stale: 30 } as const;

/**
 * The raw Better Auth session of this request, uncached — for callers that need
 * more than the user (tests, session management). Pages use `getCurrentUser`.
 */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** The session as plain data, or null. Reads the request headers inside the cached scope. */
async function readSessionUser(): Promise<CurrentUser | null> {
  'use cache: private';
  cacheLife(SESSION_CACHE);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
    isSuperadmin: user.role === 'superadmin',
  };
}

/** A cached result must be plain data, so `can` is rebuilt outside the cache. */
type TeamGrant = Omit<TeamAccess, 'can'>;
type ProjectGrant = Omit<ProjectAccess, 'can'>;

function withCan<T extends TeamGrant>(grant: T): T & { can: TeamAccess['can'] } {
  return { ...grant, can: (permission: Permission) => roleCan(grant.role, permission) };
}

async function readTeamGrant(teamSlug: string): Promise<TeamGrant | null> {
  'use cache: private';
  cacheLife(SESSION_CACHE);
  const user = await readSessionUser();
  const access = user ? await resolveTeamFor({ user, grant: null }, teamSlug) : null;
  return access ? { user: access.user, team: access.team, role: access.role } : null;
}

async function readProjectGrant(teamSlug: string, projectSlug: string): Promise<ProjectGrant | null> {
  'use cache: private';
  cacheLife(SESSION_CACHE);
  const user = await readSessionUser();
  const access = user ? await resolveProjectFor({ user, grant: null }, teamSlug, projectSlug) : null;
  return access ? { user: access.user, team: access.team, role: access.role, project: access.project } : null;
}

/**
 * The signed-in user, or null. React `cache` shares one call between a layout,
 * its page and every nested component of a render.
 */
export const getCurrentUser = cache(readSessionUser);

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
  const grant = await readTeamGrant(teamSlug);
  return grant ? withCan(grant) : null;
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
  const grant = await readProjectGrant(teamSlug, projectSlug);
  return grant ? withCan(grant) : null;
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
