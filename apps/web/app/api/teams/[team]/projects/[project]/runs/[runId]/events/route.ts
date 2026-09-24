import { and, eq } from 'drizzle-orm';
import { AccessError, requireProjectOr404 } from '@/lib/auth/access';
import { db } from '@/lib/db/drizzle';
import { isUuid } from '@/lib/db/queries/shared';
import { runs } from '@/lib/db/schema';
import { eventsSince } from '@/lib/ingest/service';
import { parseCursor } from '@/lib/live/sse';

/** Polling fallback for clients where EventSource is unavailable or keeps failing. */
export async function GET(request: Request, { params }: { params: Promise<{ team: string; project: string; runId: string }> }) {
  const { team, project: projectSlug, runId } = await params;
  if (!isUuid(runId)) return new Response('not found', { status: 404 });
  try {
    const access = await requireProjectOr404(team, projectSlug, { run: ['read'] });
    const [run] = await db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.projectId, access.project.id)))
      .limit(1);
    if (!run) throw new AccessError(404);
  } catch (error) {
    if (error instanceof AccessError) return error.toResponse();
    throw error;
  }

  const since = parseCursor(request) ?? 0;
  const events = await eventsSince(runId, since);
  return Response.json({ events, cursor: events.at(-1)?.id ?? since });
}
