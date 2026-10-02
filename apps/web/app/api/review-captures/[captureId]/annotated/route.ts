import { eq } from 'drizzle-orm';
import { resolveTeam } from '@/lib/auth/access';
import { verifyCaptureImageSignature } from '@/lib/auth/artifact-url';
import { db } from '@/lib/db/drizzle';
import { isUuid } from '@/lib/db/queries/shared';
import { projects, reviewCaptures, teams } from '@/lib/db/schema';
import { annotate } from '@/lib/review/annotate';
import { pinSpecs, readCaptureBytes } from '@/lib/review/images';
import { captureInProject } from '@/lib/review/queries';

/**
 * A review image with its comment threads drawn on it as numbered pins, at
 * full size: what the REST API links to (it returns data, never images) and
 * what a person can save or paste into a ticket. `?resolved` pins resolved
 * threads too. A session with access, or a signed link, like an artifact.
 */
export async function GET(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  const { captureId } = await params;
  if (!isUuid(captureId)) return new Response('not found', { status: 404 });
  const [row] = await db
    .select({ projectId: reviewCaptures.projectId, teamSlug: teams.slug })
    .from(reviewCaptures)
    .innerJoin(projects, eq(projects.id, reviewCaptures.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .where(eq(reviewCaptures.id, captureId))
    .limit(1);
  if (!row) return new Response('not found', { status: 404 });

  const url = new URL(request.url);
  const signed = verifyCaptureImageSignature(captureId, url.searchParams.get('exp'), url.searchParams.get('sig'));
  // 404, not 403: a capture id must not confirm that a run exists.
  if (!signed && !(await resolveTeam(row.teamSlug))?.can({ artifact: ['read'] })) return new Response('not found', { status: 404 });

  const found = await captureInProject(row.projectId, captureId);
  if (!found) return new Response('not found', { status: 404 });
  if (found.capture.attachment.status === 'expired') return new Response('image expired', { status: 410 });
  const source = await readCaptureBytes(found.capture);
  if (!source) return new Response('image not available', { status: 404 });
  const pins = pinSpecs(found.capture.threads, url.searchParams.has('resolved'));
  const out = await annotate(source.bytes, pins, { maxWidth: 1 << 14, maxPixels: 1 << 26, maxBytes: 32 * 1024 * 1024, drawings: found.capture.drawings.map((d) => d.position) });
  return new Response(new Uint8Array(out.data), {
    headers: { 'content-type': out.mimeType, 'cache-control': 'private, no-store', 'content-disposition': `inline; filename="${found.capture.checkpointName}-${found.capture.variant}-pins.${out.mimeType === 'image/png' ? 'png' : 'jpg'}"` },
  });
}
