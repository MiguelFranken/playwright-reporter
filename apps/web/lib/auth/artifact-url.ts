import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { artifactUrlTtlSeconds, authSecret } from './config';

/**
 * `trace.playwright.dev` fetches the trace from the user's browser cross-site,
 * without our cookies, so trace links carry a short-lived signature instead.
 * A signed URL leaks exactly one artifact for at most one hour, which is the
 * same exposure the trace viewer has with any URL pasted into it.
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
