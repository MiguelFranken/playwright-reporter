import { and, eq } from 'drizzle-orm';
import { AccessError, requireProjectOr404 } from '@/lib/auth/access';
import { db } from '@/lib/db/drizzle';
import { listRunResults } from '@/lib/db/queries/runs';
import { isUuid } from '@/lib/db/queries/shared';
import { runs } from '@/lib/db/schema';

/** How many rows one request may ask for; the live views ask in batches of this size. */
const MAX_IDS = 100;

/**
 * Result rows by id, as the summary table renders them. The live views know a
 * new result from its event and fetch the rest — its history, its uploads —
 * here, for exactly the rows on screen.
 */
export async function GET(request: Request, { params }: { params: Promise<{ team: string; project: string; runId: string }> }) {
  const { team, project: projectSlug, runId } = await params;
  if (!isUuid(runId)) return new Response('not found', { status: 404 });
  const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',').filter(isUuid).slice(0, MAX_IDS);
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
  if (ids.length === 0) return Response.json({ rows: [] });
  const rows = await listRunResults(runId, { ids });
  return Response.json({ rows }, { headers: { 'cache-control': 'no-store' } });
}
