/**
 * Profile images for users and teams: the Server Actions that store them and
 * the route that serves them back.
 */
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { removeMyAvatar, updateMyAvatar } from '@/app/(app)/account/actions';
import { deleteTeam, deleteUserAccount } from '@/app/(app)/admin/actions';
import { removeTeamAvatar, updateTeamAvatar } from '@/app/(app)/teams/[team]/settings/actions';
import { GET as avatarRoute } from '@/app/api/avatars/[kind]/[ownerId]/[avatarId]/route';
import { AVATAR_MAX_BYTES, parseAvatarUrl } from '@/lib/avatars';
import { auditLogs, teams, users } from '@/lib/db/schema';
import { createMember, createTenant, createUserRow, describe, expect, test, vi } from './fixtures';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

function upload(bytes: Uint8Array, type = 'image/png') {
  const formData = new FormData();
  formData.set('file', new Blob([bytes as BlobPart], { type }), 'avatar');
  return formData;
}

async function fetchAvatar(url: string) {
  const ref = parseAvatarUrl(url)!;
  return avatarRoute(new Request(`http://test.local${url}`), { params: Promise.resolve(ref) });
}

/** Every stored avatar file (not the `.meta.json` sidecars) under `avatars/<kind>`. */
async function storedAvatars(storage: string, kind: 'users' | 'teams') {
  const entries = await readdir(path.join(storage, 'avatars', kind), { recursive: true }).catch(() => []);
  return entries.filter((e) => /[0-9a-f-]{36}$/.test(e) && e.includes(path.sep));
}

describe('updateMyAvatar', () => {
  test('stores the image and points the user row at it', async ({ db, tenant, actor, storage }) => {
    actor.signIn(tenant.adminUser);

    expect(await updateMyAvatar(upload(PNG))).toEqual({ ok: true });

    const [row] = await db.select().from(users).where(eq(users.id, tenant.adminUser.id));
    expect(parseAvatarUrl(row.image)).toMatchObject({ kind: 'users', ownerId: tenant.adminUser.id });
    expect(await storedAvatars(storage, 'users')).toHaveLength(1);

    const res = await fetchAvatar(row.image!);
    expect(res.status).toBe(200);
    // The type is sniffed from the bytes, not the one the browser declared.
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  test('replacing the image deletes the old bytes and changes the URL', async ({ db, tenant, actor, storage }) => {
    actor.signIn(tenant.adminUser);
    await updateMyAvatar(upload(PNG));
    const [first] = await db.select().from(users).where(eq(users.id, tenant.adminUser.id));

    await updateMyAvatar(upload(PNG));
    const [second] = await db.select().from(users).where(eq(users.id, tenant.adminUser.id));

    expect(second.image).not.toBe(first.image);
    expect(await storedAvatars(storage, 'users')).toHaveLength(1);
    expect((await fetchAvatar(first.image!)).status).toBe(404);
  });

  test.for([
    { name: 'an SVG', bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), type: 'image/svg+xml', message: /PNG, JPEG/ },
    { name: 'HTML that claims to be a PNG', bytes: new TextEncoder().encode('<script>alert(1)</script>'), type: 'image/png', message: /PNG, JPEG/ },
    { name: 'an oversized file', bytes: new Uint8Array(AVATAR_MAX_BYTES + 1).fill(0), type: 'image/png', message: /too large/ },
    { name: 'an empty file', bytes: new Uint8Array(0), type: 'image/png', message: /Choose an image/ },
  ])('rejects $name', async ({ bytes, type, message }, { db, tenant, actor, storage }) => {
    actor.signIn(tenant.adminUser);
    expect(await updateMyAvatar(upload(bytes, type))).toMatchObject({ ok: false, message: expect.stringMatching(message) });
    const [row] = await db.select().from(users).where(eq(users.id, tenant.adminUser.id));
    expect(row.image).toBeNull();
    expect(await storedAvatars(storage, 'users')).toHaveLength(0);
  });

  test('needs a session', async ({ actor }) => {
    actor.signIn(null);
    expect(await updateMyAvatar(upload(PNG))).toMatchObject({ ok: false });
  });

  test('removeMyAvatar clears the column and the bytes', async ({ db, tenant, actor, storage }) => {
    actor.signIn(tenant.adminUser);
    await updateMyAvatar(upload(PNG));

    expect(await removeMyAvatar()).toEqual({ ok: true });
    const [row] = await db.select().from(users).where(eq(users.id, tenant.adminUser.id));
    expect(row.image).toBeNull();
    expect(await storedAvatars(storage, 'users')).toHaveLength(0);
  });

  test('never deletes a file outside the owner prefix, whatever the column says', async ({ db, tenant, actor, storage }) => {
    const other = await createUserRow(db);
    actor.signIn(other);
    await updateMyAvatar(upload(PNG));
    const [victim] = await db.select().from(users).where(eq(users.id, other.id));

    // Somebody points their own column at another user's image out of band…
    await db.update(users).set({ image: victim.image }).where(eq(users.id, tenant.adminUser.id));
    actor.signIn(tenant.adminUser);
    await removeMyAvatar();

    // …and removing "theirs" leaves the other user's file alone.
    expect(await storedAvatars(storage, 'users')).toHaveLength(1);
    expect((await fetchAvatar(victim.image!)).status).toBe(200);
  });
});

describe('updateTeamAvatar', () => {
  test('a team admin can set and remove it, and both are audited', async ({ db, tenant, actor, storage }) => {
    actor.signIn(tenant.adminUser);

    expect(await updateTeamAvatar(tenant.team.slug, upload(PNG))).toEqual({ ok: true });
    const [team] = await db.select().from(teams).where(eq(teams.id, tenant.team.id));
    expect(parseAvatarUrl(team.image)).toMatchObject({ kind: 'teams', ownerId: tenant.team.id });
    expect((await fetchAvatar(team.image!)).status).toBe(200);

    expect(await removeTeamAvatar(tenant.team.slug)).toEqual({ ok: true });
    const [after] = await db.select().from(teams).where(eq(teams.id, tenant.team.id));
    expect(after.image).toBeNull();
    expect(await storedAvatars(storage, 'teams')).toHaveLength(0);

    const actions = (await db.select().from(auditLogs)).map((a) => a.action).sort();
    expect(actions).toEqual(['team.avatar.remove', 'team.avatar.update']);
  });

  test.for(['member', 'viewer'] as const)('a %s cannot change it', async (role, { db, tenant, actor, storage }) => {
    actor.signIn(await createMember(db, tenant.team.id, role));
    expect(await updateTeamAvatar(tenant.team.slug, upload(PNG))).toMatchObject({ ok: false, message: expect.stringContaining('permission') });
    expect(await removeTeamAvatar(tenant.team.slug)).toMatchObject({ ok: false });
    expect(await storedAvatars(storage, 'teams')).toHaveLength(0);
  });

  test('an outsider gets "not found"', async ({ db, tenant, actor }) => {
    actor.signIn(await createUserRow(db));
    expect(await updateTeamAvatar(tenant.team.slug, upload(PNG))).toMatchObject({ ok: false, message: 'Team not found.' });
  });
});

describe('the avatar route', () => {
  test('needs a session', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await updateMyAvatar(upload(PNG));
    const [row] = await db.select().from(users).where(eq(users.id, tenant.adminUser.id));

    actor.signIn(null);
    expect((await fetchAvatar(row.image!)).status).toBe(401);
  });

  test('any signed-in user may see a user image', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await updateMyAvatar(upload(PNG));
    const [row] = await db.select().from(users).where(eq(users.id, tenant.adminUser.id));

    actor.signIn(await createUserRow(db));
    expect((await fetchAvatar(row.image!)).status).toBe(200);
  });

  test('a team image is only served to people who can see the team', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    await updateTeamAvatar(tenant.team.slug, upload(PNG));
    const [team] = await db.select().from(teams).where(eq(teams.id, tenant.team.id));

    actor.signIn(await createMember(db, tenant.team.id, 'viewer'));
    expect((await fetchAvatar(team.image!)).status).toBe(200);

    const other = await createTenant(db);
    actor.signIn(other.adminUser);
    expect((await fetchAvatar(team.image!)).status).toBe(404);

    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    expect((await fetchAvatar(team.image!)).status).toBe(200);
  });

  test('rejects malformed ids before touching storage', async ({ tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const res = await avatarRoute(new Request('http://test.local/'), {
      params: Promise.resolve({ kind: 'users', ownerId: tenant.adminUser.id, avatarId: '../../projects' }),
    });
    expect(res.status).toBe(404);
    const unknown = await avatarRoute(new Request('http://test.local/'), {
      params: Promise.resolve({ kind: 'projects', ownerId: randomUUID(), avatarId: randomUUID() }),
    });
    expect(unknown.status).toBe(404);
  });
});

describe('deleting the owner', () => {
  test('removes a team image with the team', async ({ db, tenant, actor, storage }) => {
    actor.signIn(tenant.adminUser);
    await updateTeamAvatar(tenant.team.slug, upload(PNG));

    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    expect(await deleteTeam(tenant.team.id, tenant.team.slug)).toEqual({ ok: true });
    await vi.waitFor(async () => expect(await storedAvatars(storage, 'teams')).toHaveLength(0));
  });

  test('removes a user image with the user', async ({ db, tenant, actor, storage }) => {
    actor.signIn(tenant.adminUser);
    await updateMyAvatar(upload(PNG));

    actor.signIn(await createUserRow(db, { instanceRole: 'superadmin' }));
    expect(await deleteUserAccount(tenant.adminUser.id)).toEqual({ ok: true });
    await vi.waitFor(async () => expect(await storedAvatars(storage, 'users')).toHaveLength(0));
  });
});
