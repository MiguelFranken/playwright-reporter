import { and, eq, inArray } from 'drizzle-orm';
import { resolveTeam } from '@/lib/auth/access';
import { verifyVisualRenderSignature } from '@/lib/auth/artifact-url';
import { db } from '@/lib/db/drizzle';
import { projects, reviewCaptures, teams } from '@/lib/db/schema';
import { decodeComparisonId } from '@miguelfranken/ui/lib/visual-diff';
import { compare, regionsOf, resolvePair } from '@/lib/review/diff/comparison';
import { parseSpecQuery } from '@/lib/review/diff/image-plan';
import { loadSource, render, RenderError } from '@/lib/review/diff/render';
import { getStorage } from '@/lib/storage';

/**
 * One rendered image of a visual comparison, as `get_visual_diff_image` with
 * `delivery: "links"` (and so the REST API) hands it out: the mode, side,
 * rectangle and policy are in the query, and the signature covers them all,
 * so a link to one crop is a link to that crop only. A session with access
 * to the project works without a signature.
 */
export async function GET(request: Request, { params }: { params: Promise<{ comparison: string }> }) {
  const { comparison } = await params;
  const decoded = decodeComparisonId(comparison);
  if (!decoded) return new Response('not found', { status: 404 });
  const url = new URL(request.url);
  const spec = parseSpecQuery(url.searchParams);
  if (!spec) return new Response('bad request', { status: 400 });
  const rows = await db
    .select({ id: reviewCaptures.id, projectId: reviewCaptures.projectId, teamSlug: teams.slug })
    .from(reviewCaptures)
    .innerJoin(projects, eq(projects.id, reviewCaptures.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .where(and(inArray(reviewCaptures.id, [decoded.baseCaptureId, decoded.headCaptureId])));
  const base = rows.find((r) => r.id === decoded.baseCaptureId);
  const head = rows.find((r) => r.id === decoded.headCaptureId);
  // 404 either way: an id must not confirm a project.
  if (!base || !head || base.projectId !== head.projectId) return new Response('not found', { status: 404 });
  const signed = verifyVisualRenderSignature(comparison, url.searchParams);
  if (!signed && !(await resolveTeam(head.teamSlug))?.can({ artifact: ['read'] })) return new Response('not found', { status: 404 });

  const pair = await resolvePair(head.projectId, decoded.baseCaptureId, decoded.headCaptureId);
  if (!pair) return new Response('not found', { status: 404 });
  const [c] = await compare([pair]);
  if (spec.revision && spec.revision !== c.revision) return new Response('the comparison changed since this link was made', { status: 409 });
  const [baseSource, headSource] = await Promise.all([loadSource(pair.base!), loadSource(pair.head!)]);
  const row = spec.policy === 'raw' ? c.raw : (c.effective ?? c.raw);
  const overlayObject = row?.status === 'done' && row.overlayKey ? await getStorage().get(row.overlayKey) : null;
  const overlay = overlayObject ? Buffer.from(await new Response(overlayObject.stream).arrayBuffer()) : null;
  const regions = regionsOf(c, spec.policy).filter((r) => spec.regionIds.length === 0 || spec.regionIds.includes(r.id));
  try {
    const out = await render(
      { mode: spec.mode, side: spec.side, rect: spec.rect, regions: spec.mode === 'annotated' ? regions : undefined, ignored: spec.showIgnored ? c.applied : [], maxBytes: 32 * 1024 * 1024 },
      { base: baseSource, head: headSource, overlay, threshold: c.settings.threshold, policy: spec.policy, ignore: c.applied },
    );
    return new Response(new Uint8Array(out.data), {
      headers: {
        'content-type': out.mimeType,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'x-source-rect': `${out.sourceRect.x},${out.sourceRect.y},${out.sourceRect.width},${out.sourceRect.height}`,
        'x-source-side': out.side,
        'x-scale': String(out.scale),
      },
    });
  } catch (error) {
    if (error instanceof RenderError) return new Response(error.message, { status: 409 });
    throw error;
  }
}
