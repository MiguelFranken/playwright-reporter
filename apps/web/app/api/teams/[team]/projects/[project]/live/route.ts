import { eq, sql } from 'drizzle-orm';
import { AccessError, requireProjectOr404 } from '@/lib/auth/access';
import { db } from '@/lib/db/drizzle';
import { runEvents } from '@/lib/db/schema';
import { projectEventsSince } from '@/lib/ingest/service';
import { sseResponse } from '@/lib/live/sse';

export const maxDuration = 300;

/**
 * Membership is checked once at connection time. A stream lives at most 300 s,
 * after which `EventSource` reconnects and the check runs again.
 */
export async function GET(request: Request, { params }: { params: Promise<{ team: string; project: string }> }) {
  const { team, project: projectSlug } = await params;
  let projectId: string;
  try {
    ({
      project: { id: projectId },
    } = await requireProjectOr404(team, projectSlug, { run: ['read'] }));
  } catch (error) {
    if (error instanceof AccessError) return error.toResponse();
    throw error;
  }

  return sseResponse(request, {
    poll: (cursor) => projectEventsSince(projectId, cursor),
    latest: async () => {
      const [r] = await db
        .select({ max: sql<number>`coalesce(max(${runEvents.id}), 0)::int` })
        .from(runEvents)
        .where(eq(runEvents.projectId, projectId));
      return r?.max ?? 0;
    },
  });
}
