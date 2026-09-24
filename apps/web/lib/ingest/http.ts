import { gunzipSync } from 'node:zlib';
import { and, eq, isNull } from 'drizzle-orm';
import { PROTOCOL_HEADER, PROTOCOL_VERSION } from '@miguelfranken/protocol';
import type { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { apiTokens, projects, teams, type Project } from '@/lib/db/schema';
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

/**
 * Named apart from the access layer's `requireProject`: this one authenticates
 * a reporter by bearer token, not a person by session.
 */
export async function requireProjectToken(request: Request): Promise<TokenProject> {
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
  const hash = hashToken(token);
  const [row] = await db
    .select({ project: projects, teamSlug: teams.slug, tokenId: apiTokens.id })
    .from(apiTokens)
    .innerJoin(projects, eq(projects.id, apiTokens.projectId))
    .innerJoin(teams, eq(teams.id, projects.teamId))
    .where(and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) throw new IngestError(401, 'invalid token');
  // Fire-and-forget usage bookkeeping.
  void db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId)).catch(() => undefined);
  return { ...row.project, teamSlug: row.teamSlug };
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
