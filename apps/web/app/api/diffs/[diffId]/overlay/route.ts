import { eq } from 'drizzle-orm';
import { resolveTeam } from '@/lib/auth/access';
import { db } from '@/lib/db/drizzle';
import { isUuid } from '@/lib/db/queries/shared';
import { imageDiffs, projects, teams } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';

/**
 * A comparison's overlay: this run's image size, transparent except the
 * changed pixels. It is read with the session, like the images it is laid
 * over; a diff id never changes its pixels, so the browser may keep it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ diffId: string }> }) {
  const { diffId } = await params;
  if (!isUuid(diffId)) return new Response('not found', { status: 404 });
  const [row] = await db
    .select({ overlayKey: imageDiffs.overlayKey, teamSlug: teams.slug })
    .from(imageDiffs)
    .innerJoin(projects, eq(projects.id, imageDiffs.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .where(eq(imageDiffs.id, diffId))
    .limit(1);
  // 404 for a diff the caller may not read too: an id must not confirm a project.
  if (!row?.overlayKey || !(await resolveTeam(row.teamSlug))?.can({ artifact: ['read'] })) return new Response('not found', { status: 404 });
  const obj = await getStorage().get(row.overlayKey);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.stream, {
    headers: {
      'content-type': 'image/png',
      'content-length': String(obj.size),
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
    },
  });
}
