import { AccessError, requireProjectOr404 } from '@/lib/auth/access';
import { getRunSummary, listRunErrorGroupsWithCursor, listRunSpecsWithCursor } from '@/lib/db/queries/runs';
import { isUuid } from '@/lib/db/queries/shared';
import { toRunHeaderData } from '@/lib/view-models';

/**
 * A run's header data, and on request its spec tallies and error groups. A
 * live run page settles on these once the run has finished — finishing
 * settles results in bulk, without an event per result — instead of
 * re-rendering the whole route.
 */
export async function GET(request: Request, { params }: { params: Promise<{ team: string; project: string; runId: string }> }) {
  const { team, project: projectSlug, runId } = await params;
  if (!isUuid(runId)) return new Response('not found', { status: 404 });
  let projectId: string;
  try {
    ({
      project: { id: projectId },
    } = await requireProjectOr404(team, projectSlug, { run: ['read'] }));
  } catch (error) {
    if (error instanceof AccessError) return error.toResponse();
    throw error;
  }
  const parts = new Set((new URL(request.url).searchParams.get('parts') ?? '').split(','));
  const [summary, specs, errors] = await Promise.all([
    getRunSummary(projectId, runId),
    parts.has('specs') ? listRunSpecsWithCursor(runId) : null,
    parts.has('errors') ? listRunErrorGroupsWithCursor(runId) : null,
  ]);
  if (!summary) return new Response('not found', { status: 404 });
  const { counts, shards, cursor, ...run } = summary;
  return Response.json(
    { header: { run: toRunHeaderData(run), counts, shards }, cursor, specs: specs?.specs ?? null, errors: errors?.groups ?? null },
    { headers: { 'cache-control': 'no-store' } },
  );
}
