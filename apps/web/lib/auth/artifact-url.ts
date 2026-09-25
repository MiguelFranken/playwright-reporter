import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { artifactUrlTtlSeconds, authSecret } from './config';

/**
 * Artifact links for callers without a session cookie — MCP clients, and
 * `npx playwright show-trace <url>` — carry a short-lived signature instead.
 * A signed URL leaks exactly one artifact until it expires. The app's own pages
 * never need one: the browser, and the self-hosted trace viewer's service
 * worker, fetch artifacts same-origin with the session.
 */
let cachedKey: Buffer | undefined;

function key() {
  if (!cachedKey) {
    cachedKey = Buffer.from(hkdfSync('sha256', Buffer.from(authSecret()), Buffer.alloc(0), Buffer.from('artifact-url'), 32));
  }
  return cachedKey;
}

function sign(attachmentId: string, exp: number) {
  return createHmac('sha256', key()).update(`${attachmentId}.${exp}`).digest('base64url');
}

/** Returns the `?exp=…&sig=…` query string for an artifact URL. */
export function artifactSignature(attachmentId: string, ttlSeconds = artifactUrlTtlSeconds()) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `exp=${exp}&sig=${sign(attachmentId, exp)}`;
}

export function signArtifactPath(attachmentId: string, ttlSeconds?: number) {
  return `/api/artifacts/${attachmentId}?${artifactSignature(attachmentId, ttlSeconds)}`;
}

export function verifyArtifactSignature(attachmentId: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false;
  const expiry = Number(exp);
  if (!Number.isFinite(expiry) || expiry * 1000 < Date.now()) return false;
  const expected = Buffer.from(sign(attachmentId, expiry));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
