/**
 * Who may read an artifact over HTTP: a signed URL (for callers without a
 * session — `npx playwright show-trace`, an AI assistant) or a session whose
 * user may read the team's artifacts. Anything else is a 404, never a 403: an
 * artifact id must not confirm that a run exists.
 *
 * One database round trip: the signature is checked first (pure HMAC), the
 * session comes from Better Auth's cookie cache, and the caller's membership is
 * joined onto the attachment's team in the same query — the same team + left
 * joined membership row `resolveTeamFor` reads, judged by the same
 * `effectiveRole`, so a session sees exactly what `resolveTeam` would allow.
 */
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/access';
import { verifyArtifactSignature } from '@/lib/auth/artifact-url';
import { roleCan } from '@/lib/auth/permissions';
import { effectiveRole } from '@/lib/auth/principal';
import { db } from '@/lib/db/drizzle';
import { isUuid } from '@/lib/db/queries/shared';
import { attachments, projects, runs, teamMembers, teams, type Attachment } from '@/lib/db/schema';

export async function readableArtifact(request: Request, attachmentId: string): Promise<{ attachment: Attachment } | Response> {
  const notFound = new Response('not found', { status: 404 });
  if (!isUuid(attachmentId)) return notFound;
  const url = new URL(request.url);
  const signed = verifyArtifactSignature(attachmentId, url.searchParams.get('exp'), url.searchParams.get('sig'));
  const user = signed ? null : await getCurrentUser();
  if (!signed && !user) return notFound;

  const [row] = await db
    .select({ attachment: attachments, teamId: teams.id, role: teamMembers.role })
    .from(attachments)
    .innerJoin(runs, eq(runs.id, attachments.runId))
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    // A signed URL needs no membership: join nothing rather than a second query shape.
    .leftJoin(teamMembers, user ? and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, user.id)) : sql`false`)
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!row) return notFound;
  if (signed) return { attachment: row.attachment };

  const role = user ? effectiveRole({ user, grant: null }, row.teamId, row.role ?? null) : null;
  if (!role || !roleCan(role, { artifact: ['read'] })) return notFound;
  return { attachment: row.attachment };
}

/** Gone for good: the retention policy (or the store's lifecycle) took the bytes. 410 rather than 404, so a client can tell it from a bad link. */
export function gone() {
  return new Response('artifact expired', { status: 410, headers: { 'cache-control': 'private, max-age=3600' } });
}
