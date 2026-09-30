/**
 * Who may read an artifact over HTTP: a signed URL (for callers without a
 * session — `npx playwright show-trace`, an AI assistant) or a session whose
 * user may read the team's artifacts. Anything else is a 404, never a 403: an
 * artifact id must not confirm that a run exists.
 */
import { eq } from 'drizzle-orm';
import { resolveTeam } from '@/lib/auth/access';
import { verifyArtifactSignature } from '@/lib/auth/artifact-url';
import { db } from '@/lib/db/drizzle';
import { isUuid } from '@/lib/db/queries/shared';
import { attachments, projects, runs, teams, type Attachment } from '@/lib/db/schema';

export async function readableArtifact(request: Request, attachmentId: string): Promise<{ attachment: Attachment } | Response> {
  const notFound = new Response('not found', { status: 404 });
  if (!isUuid(attachmentId)) return notFound;
  const [row] = await db
    .select({ attachment: attachments, teamSlug: teams.slug })
    .from(attachments)
    .innerJoin(runs, eq(runs.id, attachments.runId))
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!row) return notFound;
  const url = new URL(request.url);
  const signed = verifyArtifactSignature(attachmentId, url.searchParams.get('exp'), url.searchParams.get('sig'));
  if (!signed && !(await hasSessionAccess(row.teamSlug))) return notFound;
  return { attachment: row.attachment };
}

async function hasSessionAccess(teamSlug: string) {
  const access = await resolveTeam(teamSlug);
  return Boolean(access?.can({ artifact: ['read'] }));
}

/** Gone for good: the retention policy (or the store's lifecycle) took the bytes. 410 rather than 404, so a client can tell it from a bad link. */
export function gone() {
  return new Response('artifact expired', { status: 410, headers: { 'cache-control': 'private, max-age=3600' } });
}
