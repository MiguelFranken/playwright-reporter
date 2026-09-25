import { eq } from 'drizzle-orm';
import { resolveTeam } from '@/lib/auth/access';
import { verifyArtifactSignature } from '@/lib/auth/artifact-url';
import { db } from '@/lib/db/drizzle';
import { isUuid } from '@/lib/db/queries/shared';
import { attachments, projects, runs, teams } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { markMissingExpired } from '@/lib/storage/retention';

const INLINE_MEDIA = new Set(['video', 'screenshot', 'image']);

export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  if (!isUuid(attachmentId)) return new Response('not found', { status: 404 });

  const [row] = await db
    .select({
      attachment: attachments,
      teamSlug: teams.slug,
      projectSlug: projects.slug,
    })
    .from(attachments)
    .innerJoin(runs, eq(runs.id, attachments.runId))
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!row) return new Response('not found', { status: 404 });

  const url = new URL(request.url);
  const signed = verifyArtifactSignature(attachmentId, url.searchParams.get('exp'), url.searchParams.get('sig'));
  if (!signed && !(await hasSessionAccess(row.teamSlug))) {
    // 404, not 403: an artifact id must not confirm that a run exists.
    return new Response('not found', { status: 404 });
  }

  const { attachment } = row;
  // Gone for good: the retention policy (or the store's lifecycle) took the
  // bytes. 410 rather than 404, so a client can tell it from a bad link.
  if (attachment.status === 'expired') return gone();
  const storage = getStorage();
  const download = url.searchParams.get('download') !== null;

  // Media the browser plays itself is read straight from the store: no function
  // copies the bytes, and a video seeks with real range requests. Downloads keep
  // their file name and traces their range requests, so those stay here.
  if (storage.readUrl && !download && INLINE_MEDIA.has(attachment.kind)) {
    return new Response(null, {
      status: 302,
      headers: { location: await storage.readUrl(attachment.storageKey), 'cache-control': 'private, max-age=600' },
    });
  }

  const rangeHeader = request.headers.get('range');
  let range: { start: number; end?: number } | undefined;
  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (m && (m[1] || m[2])) range = { start: Number(m[1] || 0), end: m[2] ? Number(m[2]) : undefined };
  }
  const obj = await storage.get(attachment.storageKey, range);
  if (!obj) {
    if (await markMissingExpired(attachment.id, storage)) return gone();
    return new Response('artifact missing in storage', { status: 404 });
  }

  const disposition = download ? 'attachment' : 'inline';
  const headers: Record<string, string> = {
    'content-type': attachment.contentType || obj.contentType,
    'accept-ranges': 'bytes',
    // No longer immutable-forever: access can be revoked.
    'cache-control': 'private, max-age=3600',
    'content-disposition': `${disposition}; filename="${encodeURIComponent(attachment.name)}"`,
    'x-content-type-options': 'nosniff',
  };
  if (obj.range) {
    headers['content-range'] = `bytes ${obj.range.start}-${obj.range.end}/${obj.size}`;
    headers['content-length'] = String(obj.range.end - obj.range.start + 1);
    return new Response(obj.stream, { status: 206, headers });
  }
  headers['content-length'] = String(obj.size);
  return new Response(obj.stream, { status: 200, headers });
}

function gone() {
  return new Response('artifact expired', { status: 410, headers: { 'cache-control': 'private, max-age=3600' } });
}

async function hasSessionAccess(teamSlug: string) {
  const access = await resolveTeam(teamSlug);
  return Boolean(access?.can({ artifact: ['read'] }));
}

export async function HEAD(request: Request, ctx: { params: Promise<{ attachmentId: string }> }) {
  const res = await GET(request, ctx);
  return new Response(null, { status: res.status, headers: res.headers });
}
