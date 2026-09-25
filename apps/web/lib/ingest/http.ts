import { gunzipSync } from 'node:zlib';
import { and, eq, isNull } from 'drizzle-orm';
import { PROTOCOL_HEADER, PROTOCOL_VERSION } from '@miguelfranken/protocol';
import type { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { apiTokens, attachments, projects, runs, teams, type Attachment, type Project, type Run } from '@/lib/db/schema';
import { hashToken, isPersonalToken } from '@/lib/tokens';

export class IngestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function errorResponse(err: unknown) {
  if (err instanceof IngestError) return json({ error: err.message }, err.status);
  console.error('[ingest] unexpected error', err);
  return json({ error: 'internal error' }, 500);
}

export type TokenProject = Project & { teamSlug: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The header checks of every ingest request; no database access. */
function bearerTokenHash(request: Request): string {
  const proto = request.headers.get(PROTOCOL_HEADER);
  if (proto && Number(proto) !== PROTOCOL_VERSION) {
    throw new IngestError(426, `unsupported protocol version ${proto}; server speaks ${PROTOCOL_VERSION}`);
  }
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new IngestError(401, 'missing bearer token');
  if (isPersonalToken(token)) {
    throw new IngestError(401, 'this is a personal access token; the reporter needs a project token from Project → Settings');
  }
  return hashToken(token);
}

/** A valid, unrevoked token; what the ingest lookups join onto. */
const validToken = (hash: string) => and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt));
const tokenColumns = { project: projects, teamSlug: teams.slug, tokenId: apiTokens.id };

function tokenProject(row: { project: Project; teamSlug: string; tokenId: string } | undefined): TokenProject {
  if (!row) throw new IngestError(401, 'invalid token');
  // Fire-and-forget usage bookkeeping.
  void db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId)).catch(() => undefined);
  return { ...row.project, teamSlug: row.teamSlug };
}

async function projectForHash(hash: string): Promise<TokenProject> {
  const [row] = await db
    .select(tokenColumns)
    .from(apiTokens)
    .innerJoin(projects, eq(projects.id, apiTokens.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .where(validToken(hash))
    .limit(1);
  return tokenProject(row);
}

/**
 * Named apart from the access layer's `requireProject`: this one authenticates
 * a reporter by bearer token, not a person by session.
 */
export async function requireProjectToken(request: Request): Promise<TokenProject> {
  return projectForHash(bearerTokenHash(request));
}

/**
 * `requireProjectToken` and the token's run `runId` in one round trip. The run
 * is left-joined on the token's project, so another project's run never comes
 * back: a valid token without the run is a 404, an invalid one a 401.
 */
export async function requireRunToken(request: Request, runId: string): Promise<{ project: TokenProject; run: Run }> {
  const hash = bearerTokenHash(request);
  // Not a uuid, so not a run (and the comparison would fail on the cast).
  if (!UUID.test(runId)) {
    await projectForHash(hash);
    throw new IngestError(404, 'run not found');
  }
  const [row] = await db
    .select({ ...tokenColumns, run: runs })
    .from(apiTokens)
    .innerJoin(projects, eq(projects.id, apiTokens.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .leftJoin(runs, and(eq(runs.projectId, projects.id), eq(runs.id, runId)))
    .where(validToken(hash))
    .limit(1);
  const project = tokenProject(row);
  if (!row.run) throw new IngestError(404, 'run not found');
  return { project, run: row.run };
}

/**
 * `requireProjectToken` and attachment `attachmentId` in one round trip. The
 * attachment counts only when its run belongs to the token's project.
 */
export async function requireAttachmentToken(
  request: Request,
  attachmentId: string,
): Promise<{ project: TokenProject; attachment: Attachment }> {
  const hash = bearerTokenHash(request);
  if (!UUID.test(attachmentId)) {
    await projectForHash(hash);
    throw new IngestError(404, 'attachment not found');
  }
  const [row] = await db
    .select({ ...tokenColumns, attachment: attachments, ownRunId: runs.id })
    .from(apiTokens)
    .innerJoin(projects, eq(projects.id, apiTokens.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .leftJoin(attachments, eq(attachments.id, attachmentId))
    .leftJoin(runs, and(eq(runs.id, attachments.runId), eq(runs.projectId, projects.id)))
    .where(validToken(hash))
    .limit(1);
  const project = tokenProject(row);
  // Another project's attachment joins no run.
  if (!row.attachment || !row.ownRunId) throw new IngestError(404, 'attachment not found');
  return { project, attachment: row.attachment };
}

const MAX_BODY = Number(process.env.INGEST_MAX_BATCH_BYTES ?? 4 * 1024 * 1024);

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength > MAX_BODY) throw new IngestError(413, 'payload too large');
  let text: string;
  try {
    text = request.headers.get('content-encoding') === 'gzip' ? gunzipSync(buf).toString('utf8') : Buffer.from(buf).toString('utf8');
  } catch {
    throw new IngestError(400, 'could not decode body');
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new IngestError(400, 'invalid json');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new IngestError(400, `invalid payload: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 1000)}`);
  }
  return parsed.data;
}
