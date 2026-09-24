import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Project ingest tokens: authenticate a reporter against one project. */
export const INGEST_PREFIX = 'pwr_';
/** Personal access tokens: authenticate a *person* (the MCP server). */
export const PAT_PREFIX = 'pwr_pat_';

export function generateToken(prefix = INGEST_PREFIX) {
  const token = `${prefix}${randomBytes(32).toString('base64url')}`;
  return { token, prefix: token.slice(0, prefix.length + 6) };
}

export function isPersonalToken(token: string) {
  return token.startsWith(PAT_PREFIX);
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
