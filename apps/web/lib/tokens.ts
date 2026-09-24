import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX = 'pwr_';

export function generateToken() {
  const token = `${PREFIX}${randomBytes(32).toString('base64url')}`;
  return { token, prefix: token.slice(0, PREFIX.length + 6) };
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
