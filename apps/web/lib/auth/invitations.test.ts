import { describe, expect, it } from 'vitest';
import { generateInvitationToken, hashInvitationToken, higherRole, invitationExpiry } from './invitations';

describe('invitation tokens', () => {
  it('generates url-safe tokens with 32 bytes of entropy', () => {
    const token = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('never repeats a token', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateInvitationToken));
    expect(tokens.size).toBe(500);
  });

  it('hashes to a stable sha256 hex digest, and never stores the token itself', () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashInvitationToken(token));
    expect(hash).not.toContain(token);
    expect(hashInvitationToken(generateInvitationToken())).not.toBe(hash);
  });
});

describe('invitationExpiry', () => {
  it('defaults to seven days out', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(invitationExpiry(from).toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('honours INVITATION_TTL_HOURS', () => {
    const previous = process.env.INVITATION_TTL_HOURS;
    process.env.INVITATION_TTL_HOURS = '48';
    try {
      const from = new Date('2026-01-01T00:00:00.000Z');
      expect(invitationExpiry(from).toISOString()).toBe('2026-01-03T00:00:00.000Z');
    } finally {
      if (previous === undefined) delete process.env.INVITATION_TTL_HOURS;
      else process.env.INVITATION_TTL_HOURS = previous;
    }
  });

  it('falls back to the default for nonsense values', () => {
    const previous = process.env.INVITATION_TTL_HOURS;
    const from = new Date('2026-01-01T00:00:00.000Z');
    for (const value of ['0', '-5', 'soon']) {
      process.env.INVITATION_TTL_HOURS = value;
      expect(invitationExpiry(from).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    }
    if (previous === undefined) delete process.env.INVITATION_TTL_HOURS;
    else process.env.INVITATION_TTL_HOURS = previous;
  });
});

describe('higherRole', () => {
  it('keeps the stronger of two roles when re-inviting a member', () => {
    expect(higherRole('viewer', 'admin')).toBe('admin');
    expect(higherRole('admin', 'viewer')).toBe('admin');
    expect(higherRole('member', 'viewer')).toBe('member');
    expect(higherRole('viewer', 'member')).toBe('member');
    expect(higherRole('member', 'member')).toBe('member');
  });
});
