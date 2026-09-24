import { AccessError, requireProjectOr404 } from '@/lib/auth/access';
import { getTestOverview } from '@/lib/db/queries/explorer';
import { parseRange } from '@/lib/db/queries/shared';

/**
 * The explorer drawer's data, fetched after it has already opened.
 *
 * The page itself does not wait on this: a row click opens the drawer from what
 * the list row holds, and this fills in the history, the errors and the
 * per-environment breakdown. Keeping it off the page render is also what stops
 * a selection from re-running the table query and flashing its skeleton.
 *
 * Dates go over the wire as ISO strings; the client revives them.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ team: string; project: string; testId: string }> },
) {
  const { team, project: projectSlug, testId } = await params;
  let projectId: string;
  try {
    ({
      project: { id: projectId },
    } = await requireProjectOr404(team, projectSlug, { run: ['read'] }));
  } catch (error) {
    if (error instanceof AccessError) return error.toResponse();
    throw error;
  }

  const days = parseRange(new URL(request.url).searchParams.get('range') ?? undefined, 30);
  const overview = await getTestOverview(projectId, testId, days);
  if (!overview) return new Response('not found', { status: 404 });

  return Response.json(overview, { headers: { 'cache-control': 'no-store' } });
}
