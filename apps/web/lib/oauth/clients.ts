/**
 * OAuth clients: registered dynamically (RFC 7591) or identified by a Client
 * ID Metadata Document URL (the mechanism newer MCP clients prefer). Either
 * way we end up with a row, so the rest of the server treats them alike.
 */
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { oauthClients, type OAuthClient } from '@/lib/db/schema';
import { generateToken, hashToken, safeEqualHex } from '@/lib/tokens';
import { CIMD_TTL_MS, CLIENT_PREFIX } from './config';
import { OAuthProtocolError, invalidClient } from './errors';

/**
 * Redirect URIs we accept: https anywhere, http only on loopback (native
 * apps, RFC 8252), and private-use schemes like `cursor://`. Never fragments.
 */
export function validRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Private-use schemes contain a dot or are app names; refuse the dangerous ones.
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && !['javascript:', 'data:', 'file:', 'vbscript:', 'ftp:'].includes(url.protocol);
}

/**
 * Loopback redirect URIs may differ in port (RFC 8252 §7.3): native clients
 * pick a free port per sign-in.
 */
export function redirectUriMatches(registered: string[], presented: string): boolean {
  if (registered.includes(presented)) return true;
  let p: URL;
  try {
    p = new URL(presented);
  } catch {
    return false;
  }
  if (p.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(p.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === 'http:' && u.hostname === p.hostname && u.pathname === p.pathname && u.search === p.search;
    } catch {
      return false;
    }
  });
}

export interface RegistrationRequest {
  redirect_uris?: unknown;
  client_name?: unknown;
  client_uri?: unknown;
  logo_uri?: unknown;
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  scope?: unknown;
}

const str = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export async function registerClient(body: RegistrationRequest) {
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (redirectUris.length === 0 || redirectUris.length > 10) throw new OAuthProtocolError('invalid_redirect_uri', 'Provide 1–10 redirect_uris.');
  const bad = redirectUris.find((u) => !validRedirectUri(u));
  if (bad) throw new OAuthProtocolError('invalid_redirect_uri', `Redirect URI not allowed: ${bad}. Use https, http on localhost, or a private-use scheme.`);
  const method = str(body.token_endpoint_auth_method) ?? 'none';
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) {
    throw new OAuthProtocolError('invalid_client_metadata', `Unsupported token_endpoint_auth_method: ${method}.`);
  }
  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types : ['authorization_code', 'refresh_token'];
  if (grantTypes.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
    throw new OAuthProtocolError('invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported.');
  }
  const clientId = generateToken(CLIENT_PREFIX).token.slice(0, CLIENT_PREFIX.length + 24);
  const secret = method === 'none' ? null : generateToken('pwr_cs_').token;
  const [row] = await db
    .insert(oauthClients)
    .values({
      id: randomUUID(),
      clientId,
      kind: 'dcr',
      clientName: str(body.client_name, 120) ?? 'MCP client',
      clientUri: str(body.client_uri),
      logoUri: str(body.logo_uri),
      redirectUris,
      tokenEndpointAuthMethod: method,
      clientSecretHash: secret ? hashToken(secret) : null,
      metadata: { grant_types: grantTypes, response_types: ['code'], scope: str(body.scope) },
    })
    .returning();
  return {
    client_id: row.clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    client_name: row.clientName,
    redirect_uris: row.redirectUris,
    token_endpoint_auth_method: row.tokenEndpointAuthMethod,
    grant_types: grantTypes,
    response_types: ['code'],
  };
}

// ---------------------------------------------------------------- CIMD

export function isMetadataDocumentClientId(clientId: string) {
  return clientId.startsWith('https://');
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return PRIVATE_V4.some((re) => re.test(address));
  const a = address.toLowerCase();
  return a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80') || a.startsWith('::ffff:127.') || a.startsWith('::ffff:10.') || a.startsWith('::ffff:192.168.');
}

/**
 * Fetches a Client ID Metadata Document. This is a server-side request to a
 * URL the client chose, so it is fenced: https only, public addresses only,
 * no redirects, a short timeout and a small body.
 */
export async function fetchClientMetadata(clientId: string, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const url = new URL(clientId);
  if (url.protocol !== 'https:' || url.hash || url.username || url.password) throw invalidClient('client_id must be an https URL without credentials or fragment.');
  if (process.env.NODE_ENV === 'production' || !process.env.OAUTH_ALLOW_PRIVATE_CIMD) {
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => []);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw invalidClient('client_id does not resolve to a public address.');
  }
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } }).catch(() => null);
  if (!response?.ok) throw invalidClient('The client metadata document could not be fetched.');
  const text = await response.text();
  if (text.length > 16 * 1024) throw invalidClient('The client metadata document is too large.');
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text);
  } catch {
    throw invalidClient('The client metadata document is not JSON.');
  }
  if (doc.client_id !== clientId) throw invalidClient('The metadata document’s client_id does not match its URL.');
  return doc;
}

async function upsertMetadataClient(clientId: string, fetchImpl?: typeof fetch): Promise<OAuthClient> {
  const doc = await fetchClientMetadata(clientId, fetchImpl);
  const redirectUris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((u): u is string => typeof u === 'string' && validRedirectUri(u)) : [];
  if (redirectUris.length === 0) throw invalidClient('The client metadata document lists no usable redirect_uris.');
  const values = {
    clientName: str(doc.client_name, 120) ?? new URL(clientId).hostname,
    clientUri: str(doc.client_uri),
    logoUri: str(doc.logo_uri),
    redirectUris,
    // Metadata-document clients are public: there is no secret to register.
    tokenEndpointAuthMethod: 'none',
    metadata: doc,
    fetchedAt: new Date(),
  };
  const [row] = await db
    .insert(oauthClients)
    .values({ id: randomUUID(), clientId, kind: 'cimd', ...values })
    .onConflictDoUpdate({ target: oauthClients.clientId, set: values })
    .returning();
  return row;
}

export async function findClient(clientId: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<OAuthClient | null> {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
  if (isMetadataDocumentClientId(clientId)) {
    if (row && row.fetchedAt && Date.now() - row.fetchedAt.getTime() < CIMD_TTL_MS) return row;
    try {
      return await upsertMetadataClient(clientId, opts.fetchImpl);
    } catch (error) {
      if (row) return row; // keep serving a known client through a brief outage of its metadata host
      throw error;
    }
  }
  return row ?? null;
}

/** Client authentication at the token and revocation endpoints. */
export async function authenticateClient(request: Request, params: URLSearchParams): Promise<OAuthClient> {
  let clientId = params.get('client_id');
  let secret = params.get('client_secret');
  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    clientId = decodeURIComponent(decoded.slice(0, sep));
    secret = decodeURIComponent(decoded.slice(sep + 1));
  }
  if (!clientId) throw invalidClient('client_id is required.');
  const client = await findClient(clientId);
  if (!client) throw invalidClient('Unknown client.');
  if (client.tokenEndpointAuthMethod !== 'none') {
    if (!secret || !client.clientSecretHash || !safeEqualHex(hashToken(secret), client.clientSecretHash)) throw invalidClient('Client authentication failed.');
  }
  return client;
}
