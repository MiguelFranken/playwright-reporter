import { AccessError, requireProjectOr404 } from '@/lib/auth/access';
import { listRunItems } from '@/lib/db/queries/runs';
import { isUuid } from '@/lib/db/queries/shared';
import { toRunListItem } from '@/lib/view-models';

const MAX_IDS = 25;

/**
 * Runs by id, as the runs list renders them. A project page that sees a
 * `run.started` event fetches the new run here and inserts it in place.
 */
export async function GET(request: Request, { params }: { params: Promise<{ team: string; project: string }> }) {
  const { team, project: projectSlug } = await params;
  const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',').filter(isUuid).slice(0, MAX_IDS);
  let projectId: string;
  try {
    ({
      project: { id: projectId },
    } = await requireProjectOr404(team, projectSlug, { run: ['read'] }));
  } catch (error) {
    if (error instanceof AccessError) return error.toResponse();
    throw error;
  }
  const runs = (await listRunItems(projectId, ids)).map(toRunListItem);
  return Response.json({ runs }, { headers: { 'cache-control': 'no-store' } });
}
