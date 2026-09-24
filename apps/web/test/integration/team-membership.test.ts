/**
 * 8.7 — invitations and membership, driven through the Server Actions the UI
 * calls. Better Auth is real (`createUser` really hashes a password); only
 * `next/headers`, `next/cache` and the session lookup are mocked.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  addExistingUser,
  inviteMember,
  regenerateInvitation,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from '@/app/(app)/teams/[team]/settings/actions';
import { acceptInvitationExisting, acceptInvitationNewUser } from '@/app/invite/[token]/actions';
import { hashInvitationToken, higherRole, resolveInvitation } from '@/lib/auth/invitations';
import { getUserByEmail } from '@/lib/db/queries/teams';
import { auditLogs, teamInvitations, teamMembers, users } from '@/lib/db/schema';
import { createMember, createTenant, createUserRow, describe, expect, pgError, test } from './fixtures';

/** The action returns the link; the token is its last path segment. */
const tokenOf = (link: string) => link.split('/').at(-1)!;

const PASSWORD = 'a-long-enough-password';

describe('inviteMember', () => {
  test('stores a hashed token and hands back a usable link', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);

    const result = await inviteMember(tenant.team.slug, 'New.Person@Example.Test', 'member');
    expect(result).toMatchObject({ ok: true });
    const token = tokenOf((result as { link: string }).link);
    expect((result as { link: string }).link).toBe(`http://test.local/invite/${token}`);

    const [row] = await db.select().from(teamInvitations);
    expect(row).toMatchObject({ teamId: tenant.team.id, email: 'new.person@example.test', role: 'member', invitedBy: tenant.adminUser.id });
    // The raw token is never stored.
    expect(row.tokenHash).toBe(hashInvitationToken(token));
    expect(row.tokenHash).not.toContain(token);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const resolved = await resolveInvitation(token);
    expect(resolved).toMatchObject({ teamId: tenant.team.id, teamSlug: tenant.team.slug, email: 'new.person@example.test', role: 'member' });
  });

  test.for([
    { name: 'a malformed email', email: 'not-an-email', role: 'member', message: /valid email/ },
    { name: 'an unknown role', email: 'a@example.test', role: 'overlord', message: /valid role/ },
  ])('rejects $name', async ({ email, role, message }, { tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await inviteMember(tenant.team.slug, email, role)).toMatchObject({ ok: false, message: expect.stringMatching(message) });
  });

  test('refuses a second pending invitation for the same email', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await inviteMember(tenant.team.slug, 'dup@example.test', 'member');

    const second = await inviteMember(tenant.team.slug, 'dup@example.test', 'viewer');
    expect(second).toMatchObject({ ok: false, message: expect.stringContaining('pending invitation') });
    expect(await db.select().from(teamInvitations)).toHaveLength(1);
  });

  test('the partial unique index stops a duplicate that skips the action', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await inviteMember(tenant.team.slug, 'dup@example.test', 'member');

    await expect(
      db.insert(teamInvitations).values({
        id: randomUUID(),
        teamId: tenant.team.id,
        email: 'dup@example.test',
        role: 'viewer',
        tokenHash: hashInvitationToken('another'),
        expiresAt: new Date(Date.now() + 3600_000),
      }),
    ).rejects.toSatisfy((error) => pgError(error).constraint_name === 'team_invitations_pending_email_idx');
  });

  test('allows a fresh invitation once the previous one was revoked', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await inviteMember(tenant.team.slug, 'again@example.test', 'member');
    const [pending] = await db.select().from(teamInvitations);
    await revokeInvitation(tenant.team.slug, pending.id);

    expect(await inviteMember(tenant.team.slug, 'again@example.test', 'admin')).toMatchObject({ ok: true });
    expect(await db.select().from(teamInvitations)).toHaveLength(2);
  });

  test('refuses to invite somebody who is already a member', async ({ db, tenant, actor }) => {
    const member = await createMember(db, tenant.team.id, 'viewer');
    actor.signIn(tenant.adminUser);

    expect(await inviteMember(tenant.team.slug, member.email, 'admin')).toMatchObject({
      ok: false,
      message: expect.stringContaining('already a member'),
    });
  });

  test('a viewer may not invite anybody', async ({ db, tenant, actor }) => {
    const viewer = await createMember(db, tenant.team.id, 'viewer');
    actor.signIn(viewer);

    expect(await inviteMember(tenant.team.slug, 'x@example.test', 'member')).toMatchObject({ ok: false });
    expect(await db.select().from(teamInvitations)).toHaveLength(0);
  });

  test('a member of another team cannot invite into this one', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    actor.signIn(other.adminUser);

    expect(await inviteMember(tenant.team.slug, 'x@example.test', 'member')).toMatchObject({
      ok: false,
      message: expect.stringContaining('not found'),
    });
  });
});

describe('resolveInvitation', () => {
  async function invite(teamSlug: string, email = 'invitee@example.test', role = 'member') {
    const result = await inviteMember(teamSlug, email, role);
    return tokenOf((result as { link: string }).link);
  }

  test('returns null for a token that was never issued', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await invite(tenant.team.slug);
    expect(await resolveInvitation('some-other-token')).toBeNull();
    expect(await resolveInvitation('')).toBeNull();
  });

  test('returns null once the invitation is revoked', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const token = await invite(tenant.team.slug);
    const [row] = await db.select().from(teamInvitations);

    expect(await revokeInvitation(tenant.team.slug, row.id)).toMatchObject({ ok: true });
    expect(await resolveInvitation(token)).toBeNull();
  });

  test('returns null once the invitation has expired', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const token = await invite(tenant.team.slug);
    await db.update(teamInvitations).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await resolveInvitation(token)).toBeNull();
  });

  test('regenerating replaces the token and invalidates the old one', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const old = await invite(tenant.team.slug);
    const [row] = await db.select().from(teamInvitations);

    const result = await regenerateInvitation(tenant.team.slug, row.id);
    expect(result).toMatchObject({ ok: true });
    const fresh = tokenOf((result as { link: string }).link);

    expect(fresh).not.toBe(old);
    expect(await resolveInvitation(old)).toBeNull();
    expect(await resolveInvitation(fresh)).toMatchObject({ email: 'invitee@example.test' });
    expect(await db.select().from(teamInvitations)).toHaveLength(1);
  });
});

describe('accepting an invitation as a new user', () => {
  async function invite(tenantSlug: string, email: string, role = 'member') {
    const result = await inviteMember(tenantSlug, email, role);
    return tokenOf((result as { link: string }).link);
  }

  test('creates the account, the membership and an audit entry', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const token = await invite(tenant.team.slug, 'joiner@example.test', 'member');
    actor.signIn(null);

    const result = await acceptInvitationNewUser(token, 'New Joiner', PASSWORD, PASSWORD);
    expect(result).toEqual({ ok: true, teamSlug: tenant.team.slug });

    const user = await getUserByEmail('joiner@example.test');
    expect(user).toMatchObject({ name: 'New Joiner', role: 'user' });

    const [membership] = await db.select().from(teamMembers).where(eq(teamMembers.userId, user!.id));
    expect(membership).toMatchObject({ teamId: tenant.team.id, role: 'member' });

    const [invitation] = await db.select().from(teamInvitations);
    expect(invitation.acceptedBy).toBe(user!.id);
    expect(invitation.acceptedAt).not.toBeNull();

    const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'member.join'));
    expect(entry).toMatchObject({ actorId: user!.id, teamId: tenant.team.id });
    expect(entry.target).toMatchObject({ email: 'joiner@example.test', role: 'member' });
  });

  test('a token can only be spent once', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const token = await invite(tenant.team.slug, 'once@example.test');
    actor.signIn(null);

    expect(await acceptInvitationNewUser(token, 'Once', PASSWORD, PASSWORD)).toMatchObject({ ok: true });

    const second = await acceptInvitationNewUser(token, 'Twice', PASSWORD, PASSWORD);
    expect(second).toMatchObject({ ok: false, message: expect.stringContaining('no longer valid') });
    expect(await db.select().from(users).where(eq(users.email, 'once@example.test'))).toHaveLength(1);
    expect(await db.select().from(teamMembers).where(eq(teamMembers.teamId, tenant.team.id))).toHaveLength(2);
  });

  test.for([
    { name: 'mismatched passwords', password: PASSWORD, confirm: 'something-else-entirely', message: /do not match/ },
    { name: 'a password that is too short', password: 'short', confirm: 'short', message: /at least 10/ },
    { name: 'an empty name', password: PASSWORD, confirm: PASSWORD, name_: '  ', message: /Enter your name/ },
  ])('rejects $name', async ({ password, confirm, message, name_ }, { db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const token = await invite(tenant.team.slug, 'picky@example.test');
    actor.signIn(null);

    const result = await acceptInvitationNewUser(token, name_ ?? 'Picky', password, confirm);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(message) });
    expect(await db.select().from(users).where(eq(users.email, 'picky@example.test'))).toHaveLength(0);
  });

  test('tells an existing account holder to sign in instead', async ({ db, tenant, actor }) => {
    const existing = await createUserRow(db, { email: 'known@example.test' });
    actor.signIn(tenant.adminUser);
    const token = await invite(tenant.team.slug, existing.email);
    actor.signIn(null);

    expect(await acceptInvitationNewUser(token, 'Known', PASSWORD, PASSWORD)).toMatchObject({
      ok: false,
      message: expect.stringContaining('Sign in'),
    });
    expect(await db.select().from(teamMembers).where(eq(teamMembers.userId, existing.id))).toHaveLength(0);
  });
});

describe('accepting an invitation while signed in', () => {
  test('joins the team as the invited role', async ({ db, tenant, actor }) => {
    const outsider = await createUserRow(db, { email: 'outsider@example.test' });
    actor.signIn(tenant.adminUser);
    const invited = await inviteMember(tenant.team.slug, outsider.email, 'admin');
    actor.signIn(outsider);

    expect(await acceptInvitationExisting(tokenOf((invited as { link: string }).link))).toEqual({
      ok: true,
      teamSlug: tenant.team.slug,
    });
    const [membership] = await db.select().from(teamMembers).where(eq(teamMembers.userId, outsider.id));
    expect(membership.role).toBe('admin');
  });

  test('refuses when the signed-in email is not the invited one', async ({ db, tenant, actor }) => {
    const someone = await createUserRow(db, { email: 'someone@example.test' });
    actor.signIn(tenant.adminUser);
    const invited = await inviteMember(tenant.team.slug, 'different@example.test', 'member');
    actor.signIn(someone);

    const result = await acceptInvitationExisting(tokenOf((invited as { link: string }).link));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('different@example.test') });
    expect(await db.select().from(teamMembers).where(eq(teamMembers.userId, someone.id))).toHaveLength(0);
  });

  test('keeps the stronger role when an existing member re-accepts', async ({ db, tenant, actor }) => {
    const admin = await createMember(db, tenant.team.id, 'admin', { email: 'strong@example.test' });
    actor.signIn(tenant.adminUser);
    const invited = await inviteMember(tenant.team.slug, 'unused@example.test', 'viewer');
    // Re-point the invitation at somebody who is already an admin.
    await db.update(teamInvitations).set({ email: admin.email });
    actor.signIn(admin);

    expect(await acceptInvitationExisting(tokenOf((invited as { link: string }).link))).toMatchObject({ ok: true });

    const [membership] = await db.select().from(teamMembers).where(eq(teamMembers.userId, admin.id));
    expect(membership.role).toBe('admin');
    expect(higherRole('admin', 'viewer')).toBe('admin');
  });

  test('upgrades a weaker existing role', async ({ db, tenant, actor }) => {
    const viewer = await createMember(db, tenant.team.id, 'viewer', { email: 'weak@example.test' });
    actor.signIn(tenant.adminUser);
    const invited = await inviteMember(tenant.team.slug, 'unused@example.test', 'admin');
    await db.update(teamInvitations).set({ email: viewer.email });
    actor.signIn(viewer);

    await acceptInvitationExisting(tokenOf((invited as { link: string }).link));

    const [membership] = await db.select().from(teamMembers).where(eq(teamMembers.userId, viewer.id));
    expect(membership.role).toBe('admin');
  });

  test('needs a session', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const invited = await inviteMember(tenant.team.slug, 'nobody@example.test', 'member');
    actor.signIn(null);

    expect(await acceptInvitationExisting(tokenOf((invited as { link: string }).link))).toMatchObject({
      ok: false,
      message: expect.stringContaining('Sign in'),
    });
  });
});

describe('addExistingUser', () => {
  test('adds somebody who already has an account', async ({ db, tenant, actor }) => {
    const user = await createUserRow(db, { email: 'here@example.test' });
    actor.signIn(tenant.adminUser);

    expect(await addExistingUser(tenant.team.slug, 'HERE@example.test', 'viewer')).toEqual({ ok: true });
    const [membership] = await db.select().from(teamMembers).where(eq(teamMembers.userId, user.id));
    expect(membership).toMatchObject({ role: 'viewer', addedBy: tenant.adminUser.id });
    expect(await db.select().from(teamInvitations)).toHaveLength(0);
  });

  test('rejects an unknown email and an existing member', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await addExistingUser(tenant.team.slug, 'ghost@example.test', 'member')).toMatchObject({
      ok: false,
      message: expect.stringContaining('No account'),
    });

    const member = await createMember(db, tenant.team.id, 'member');
    expect(await addExistingUser(tenant.team.slug, member.email, 'admin')).toMatchObject({
      ok: false,
      message: expect.stringContaining('already a member'),
    });
  });
});

describe('updateMemberRole and removeMember', () => {
  test('changes a role and records it', async ({ db, tenant, actor }) => {
    const member = await createMember(db, tenant.team.id, 'viewer');
    actor.signIn(tenant.adminUser);

    expect(await updateMemberRole(tenant.team.slug, member.id, 'admin')).toEqual({ ok: true });
    const [row] = await db.select().from(teamMembers).where(eq(teamMembers.userId, member.id));
    expect(row.role).toBe('admin');

    const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'member.role'));
    expect(entry.target).toMatchObject({ userId: member.id, from: 'viewer', to: 'admin' });
    expect(entry.actorId).toBe(tenant.adminUser.id);
  });

  test('removes a member and records it', async ({ db, tenant, actor }) => {
    const member = await createMember(db, tenant.team.id, 'member');
    actor.signIn(tenant.adminUser);

    expect(await removeMember(tenant.team.slug, member.id)).toEqual({ ok: true });
    expect(await db.select().from(teamMembers).where(eq(teamMembers.userId, member.id))).toHaveLength(0);

    const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'member.remove'));
    expect(entry.target).toMatchObject({ userId: member.id, role: 'member' });
  });

  test('refuses to demote or remove the only admin', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);

    const demote = await updateMemberRole(tenant.team.slug, tenant.adminUser.id, 'viewer');
    expect(demote).toMatchObject({ ok: false, message: expect.stringContaining('at least one admin') });
    const remove = await removeMember(tenant.team.slug, tenant.adminUser.id);
    expect(remove).toMatchObject({ ok: false, message: expect.stringContaining('at least one admin') });

    const [row] = await db.select().from(teamMembers).where(eq(teamMembers.userId, tenant.adminUser.id));
    expect(row.role).toBe('admin');
  });

  test('allows it once a second admin exists', async ({ db, tenant, actor }) => {
    const other = await createMember(db, tenant.team.id, 'admin');
    actor.signIn(tenant.adminUser);

    expect(await updateMemberRole(tenant.team.slug, tenant.adminUser.id, 'viewer')).toEqual({ ok: true });
    const [row] = await db.select().from(teamMembers).where(eq(teamMembers.userId, other.id));
    expect(row.role).toBe('admin');
  });

  test('a superadmin may remove the last admin', async ({ db, tenant, actor }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(root);

    expect(await removeMember(tenant.team.slug, tenant.adminUser.id)).toEqual({ ok: true });
    expect(await db.select().from(teamMembers).where(eq(teamMembers.teamId, tenant.team.id))).toHaveLength(0);
  });

  test('is a no-op when the role does not change', async ({ db, tenant, actor }) => {
    const member = await createMember(db, tenant.team.id, 'member');
    actor.signIn(tenant.adminUser);

    expect(await updateMemberRole(tenant.team.slug, member.id, 'member')).toEqual({ ok: true });
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'member.role'))).toHaveLength(0);
  });

  test('rejects somebody who is not a member of the team', async ({ db, tenant, actor }) => {
    const stranger = await createUserRow(db);
    actor.signIn(tenant.adminUser);

    expect(await updateMemberRole(tenant.team.slug, stranger.id, 'admin')).toMatchObject({ ok: false });
    expect(await removeMember(tenant.team.slug, stranger.id)).toMatchObject({ ok: false });
  });

  test('a member without the permission cannot change roles', async ({ db, tenant, actor }) => {
    const plain = await createMember(db, tenant.team.id, 'member');
    const victim = await createMember(db, tenant.team.id, 'viewer');
    actor.signIn(plain);

    expect(await updateMemberRole(tenant.team.slug, victim.id, 'admin')).toMatchObject({ ok: false });
    const [row] = await db.select().from(teamMembers).where(eq(teamMembers.userId, victim.id));
    expect(row.role).toBe('viewer');
  });
});

describe('the audit trail', () => {
  test('records every membership mutation with its actor and team', async ({ db, tenant, actor }) => {
    const member = await createMember(db, tenant.team.id, 'viewer');
    actor.signIn(tenant.adminUser);

    await inviteMember(tenant.team.slug, 'audited@example.test', 'member');
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(and(eq(teamInvitations.teamId, tenant.team.id), isNull(teamInvitations.acceptedAt)));
    await regenerateInvitation(tenant.team.slug, invitation.id);
    await revokeInvitation(tenant.team.slug, invitation.id);
    await updateMemberRole(tenant.team.slug, member.id, 'member');
    await removeMember(tenant.team.slug, member.id);

    const entries = await db.select().from(auditLogs).orderBy(desc(auditLogs.id));
    expect(entries.map((e) => e.action)).toEqual([
      'member.remove',
      'member.role',
      'member.invite.revoke',
      'member.invite.regenerate',
      'member.invite',
    ]);
    expect(entries.every((e) => e.actorId === tenant.adminUser.id && e.teamId === tenant.team.id)).toBe(true);
  });

  test('picks up the client ip from the forwarded header', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    actor.setHeaders({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });

    await inviteMember(tenant.team.slug, 'ip@example.test', 'member');

    const [entry] = await db.select().from(auditLogs);
    expect(entry.ipAddress).toBe('203.0.113.7');
  });
});
