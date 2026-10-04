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

/**
 * A review capture drawn with its comment threads as numbered pins
 * (`/api/review-captures/{id}/annotated`), signed like an artifact link. The
 * signature covers a distinct subject, so it cannot be replayed as one.
 */
const captureImageSubject = (captureId: string) => `review-annotated:${captureId}`;

export function signCaptureImagePath(captureId: string, ttlSeconds = artifactUrlTtlSeconds()) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/review-captures/${captureId}/annotated?exp=${exp}&sig=${sign(captureImageSubject(captureId), exp)}`;
}

export function verifyCaptureImageSignature(captureId: string, exp: string | null, sig: string | null): boolean {
  return verifyArtifactSignature(captureImageSubject(captureId), exp, sig);
}

/**
 * A rendered image of a visual comparison (`/api/visual-diffs/{comparison}/render`),
 * signed over the comparison *and* every rendering parameter, so a link to
 * one crop cannot be turned into a link to a larger one or to the other image.
 */
const renderSubject = (comparisonId: string, params: URLSearchParams) => {
  const canonical = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  return `visual-render:${comparisonId}:${canonical}`;
};

export function signVisualRenderPath(comparisonId: string, params: URLSearchParams, ttlSeconds = artifactUrlTtlSeconds()) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const query = new URLSearchParams(params);
  query.set('exp', String(exp));
  query.set('sig', sign(renderSubject(comparisonId, params), exp));
  return { path: `/api/visual-diffs/${comparisonId}/render?${query}`, expiresAt: new Date(exp * 1000) };
}

export function verifyVisualRenderSignature(comparisonId: string, query: URLSearchParams): boolean {
  const params = new URLSearchParams(query);
  const exp = params.get('exp');
  const sig = params.get('sig');
  params.delete('exp');
  params.delete('sig');
  return verifyArtifactSignature(renderSubject(comparisonId, params), exp, sig);
}
