/**
 * An MCP client wired straight into the route handler — the pattern from the
 * SDK's own testing docs. No network: the transport's `fetch` calls `POST`
 * (or `GET`/`DELETE`) from `app/api/mcp/route.ts` with a real `Request`.
 */
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { DELETE, GET, POST } from '@/app/api/mcp/route';
import { db } from '@/lib/db/drizzle';
import { personalAccessTokens, type User } from '@/lib/db/schema';
import { PAT_PREFIX, generateToken, hashToken } from '@/lib/tokens';

export type Era = 'legacy' | 'modern';

export const ERAS: Era[] = ['legacy', 'modern'];

/** A Request as Next.js hands it to a route: with the Host header a network hop always sets. */
function asRouteRequest(url: string | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has('host')) headers.set('host', new URL(url).host);
  return new Request(url, { ...init, headers });
}

export function routeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const request = asRouteRequest(url, init);
  const method = request.method.toUpperCase();
  return method === 'GET' ? GET(request) : method === 'DELETE' ? DELETE(request) : POST(request);
}

export async function mcpClient({ token, query = '', era = 'legacy', headers = {} }: { token: string; query?: string; era?: Era; headers?: Record<string, string> }) {
  const transport = new StreamableHTTPClientTransport(new URL(`http://test.local/api/mcp${query}`), {
    fetch: routeFetch,
    authProvider: { token: async () => token },
    requestInit: { headers },
  });
  const client = new Client(
    { name: 'integration-test', version: '0.0.0' },
    { versionNegotiation: { mode: era === 'modern' ? { pin: '2026-07-28' } : 'legacy' } },
  );
  await client.connect(transport);
  return client;
}

export interface TokenOptions {
  teamIds?: string[] | null;
  projectId?: string | null;
  allTeams?: boolean;
  scopes?: string[];
  expiresAt?: Date;
  name?: string;
}

/** Inserts a personal access token directly and returns the secret. */
export async function createPat(user: Pick<User, 'id'>, opts: TokenOptions = {}) {
  const { token, prefix } = generateToken(PAT_PREFIX);
  const id = randomUUID();
  await db.insert(personalAccessTokens).values({
    id,
    userId: user.id,
    name: opts.name ?? 'test token',
    tokenHash: hashToken(token),
    tokenPrefix: prefix,
    scopes: opts.scopes ?? ['read'],
    teamIds: opts.teamIds ?? null,
    projectId: opts.projectId ?? null,
    allTeams: opts.allTeams ?? false,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 86_400_000),
  });
  return { token, id };
}

export type CallResult = Awaited<ReturnType<Client['callTool']>> & {
  structuredContent?: Record<string, unknown>;
  content: { type: string; text?: string }[];
};

export async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<CallResult> {
  return (await client.callTool({ name, arguments: args })) as CallResult;
}

export function text(result: CallResult): string {
  return result.content.map((c) => ('text' in c ? (c.text ?? '') : '')).join('\n');
}

/** A raw JSON-RPC POST, for asserting on HTTP status and headers. */
export function rawPost(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    asRouteRequest('http://test.local/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

export const initializeBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw', version: '0' } },
};
