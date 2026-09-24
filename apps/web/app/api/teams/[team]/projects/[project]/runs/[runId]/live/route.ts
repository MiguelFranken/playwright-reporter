import { and, eq, sql } from 'drizzle-orm';
import { AccessError, requireProjectOr404 } from '@/lib/auth/access';
import { db } from '@/lib/db/drizzle';
import { runEvents, runs } from '@/lib/db/schema';
import { isUuid } from '@/lib/db/queries/shared';
import { eventsSince } from '@/lib/ingest/service';
import { sseResponse } from '@/lib/live/sse';
import { effectiveStatusSql } from '@/lib/runs/staleness';

export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ team: string; project: string; runId: string }> }) {
  const { team, project: projectSlug, runId } = await params;
  if (!isUuid(runId)) return new Response('not found', { status: 404 });
  try {
    const access = await requireProjectOr404(team, projectSlug, { run: ['read'] });
    // The run must belong to the project the caller was authorized for.
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

  return sseResponse(request, {
    poll: (cursor) => eventsSince(runId, cursor),
    latest: async () => {
      const [r] = await db
        .select({ max: sql<number>`coalesce(max(${runEvents.id}), 0)::int` })
        .from(runEvents)
        .where(eq(runEvents.runId, runId));
      return r?.max ?? 0;
    },
    endsWith: (ev) => ev.type === 'run.finished',
    // A safety net for a run gone stale without its stream seeing the event
    // (no watchdog recorded it, or not yet).
    isDone: async () => {
      const [r] = await db.select({ status: effectiveStatusSql }).from(runs).where(eq(runs.id, runId));
      return !r || r.status !== 'running';
    },
  });
}
