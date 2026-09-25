import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { auditLogs, projects, teamInvitations, teamMembers, teams, users } from '@/lib/db/schema';

/** Teams the user is a member of, newest membership last. */
export async function listMyTeams(userId: string) {
  return db
    .select({ id: teams.id, slug: teams.slug, name: teams.name, image: teams.image, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId))
    .orderBy(asc(teams.name));
}

/** Every team, for superadmins. */
export async function listAllTeams() {
  return db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      image: teams.image,
      createdAt: teams.createdAt,
      // Drizzle renders bare column names inside a `sql` template, so these
      // sub-selects qualify them explicitly: an unqualified `id` would bind to
      // the inner table and silently count nothing.
      memberCount: sql<number>`(select count(*)::int from team_members tm where tm.team_id = teams.id)`,
      projectCount: sql<number>`(select count(*)::int from projects p where p.team_id = teams.id)`,
    })
    .from(teams)
    .orderBy(asc(teams.name));
}

/**
 * Projects for several teams at once. The sidebar renders the active team's
 * projects on the client (it reads the team from the URL), so the shell loads
 * every team it offers in one round trip instead of one query per navigation.
 */
export async function listProjectsForTeams(teamIds: string[]) {
  if (teamIds.length === 0) return [];
  return db
    .select({ teamId: projects.teamId, slug: projects.slug, name: projects.name })
    .from(projects)
    .where(inArray(projects.teamId, teamIds))
    .orderBy(asc(projects.createdAt));
}

export async function listTeamProjects(teamId: string) {
  return db.select().from(projects).where(eq(projects.teamId, teamId)).orderBy(asc(projects.createdAt));
}

export async function listTeamMembers(teamId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      instanceRole: users.role,
      banned: users.banned,
      role: teamMembers.role,
      joinedAt: teamMembers.createdAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(users.name));
}

export async function countTeamAdmins(teamId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'admin')));
  return row?.n ?? 0;
}

export async function listPendingInvitations(teamId: string) {
  return db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      expiresAt: teamInvitations.expiresAt,
      createdAt: teamInvitations.createdAt,
      invitedByName: users.name,
      invitedByEmail: users.email,
    })
    .from(teamInvitations)
    .leftJoin(users, eq(users.id, teamInvitations.invitedBy))
    .where(and(eq(teamInvitations.teamId, teamId), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt)))
    .orderBy(desc(teamInvitations.createdAt));
}

export async function listAuditLogs(opts: { teamId?: string; actorId?: string; limit?: number } = {}) {
  return auditLogQuery(opts).limit(opts.limit ?? 200);
}

/** One page of the audit log, newest first, with the count of every entry. */
export async function listAuditLogPage(opts: { page?: number; pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 50;
  const page = opts.page ?? 1;
  const [rows, [{ total }]] = await Promise.all([
    auditLogQuery({}).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs),
  ]);
  return { rows, total: Number(total), page, pageSize };
}

function auditLogQuery(opts: { teamId?: string; actorId?: string }) {
  const where = [
    opts.teamId ? eq(auditLogs.teamId, opts.teamId) : undefined,
    opts.actorId ? eq(auditLogs.actorId, opts.actorId) : undefined,
  ].filter(Boolean);
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      target: auditLogs.target,
      createdAt: auditLogs.createdAt,
      ipAddress: auditLogs.ipAddress,
      actorName: users.name,
      actorEmail: users.email,
      teamSlug: teams.slug,
      teamName: teams.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .leftJoin(teams, eq(teams.id, auditLogs.teamId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLogs.id))
    .$dynamic();
}

// --------------------------------------------------------------------- users

/** One page of the instance's accounts, by email, with the count of every match. */
export async function listUsers(q?: string, opts: { page?: number; pageSize?: number } = {}) {
  const term = q?.trim().toLowerCase();
  const pageSize = opts.pageSize ?? 50;
  const page = opts.page ?? 1;
  const where = term ? sql`lower(${users.name}) like ${`%${term}%`} or lower(${users.email}) like ${`%${term}%`}` : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        banned: users.banned,
        banReason: users.banReason,
        createdAt: users.createdAt,
        teamCount: sql<number>`(select count(*)::int from team_members tm where tm.user_id = users.id)`,
      })
      .from(users)
      .where(where)
      .orderBy(asc(users.email))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(where),
  ]);
  return { rows, total: Number(total), page, pageSize };
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  return user ?? null;
}
