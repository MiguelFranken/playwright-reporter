/**
 * 8.9 — what the database guarantees on its own: the delete cascades that keep
 * a removed project from leaving orphans, and the constraints the actions rely
 * on rather than re-checking.
 */
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createTeam, deleteTeam, deleteUserAccount } from '@/app/(app)/admin/actions';
import { deleteProject } from '@/app/(app)/teams/[team]/settings/actions';
import { storeUpload } from '@/lib/ingest/service';
import {
  apiTokens,
  attachments,
  auditLogs,
  projects,
  runEvents,
  runShards,
  runs,
  teamInvitations,
  teamMembers,
  teams,
  testAttempts,
  testResults,
  tests,
  users,
} from '@/lib/db/schema';
import { attachmentRef, playRun } from './factories';
import { createMember, createTenant, createUserRow, describe, expect, pgError, test, vi, type Db, type Tenant } from './fixtures';

/** A run with results, attempts, an uploaded attachment and events. */
async function seedRun(tenant: Tenant) {
  const ref = attachmentRef({ name: 'screenshot.png', contentType: 'image/png' });
  const played = await playRun(tenant.tokenProject, {
    tests: [{ outcome: 'failed', title: 'with an artifact', attachments: [ref], error: 'boom' }],
  });
  return { ...played, ref };
}

async function counts(db: Db) {
  return {
    runs: (await db.select().from(runs)).length,
    shards: (await db.select().from(runShards)).length,
    results: (await db.select().from(testResults)).length,
    attempts: (await db.select().from(testAttempts)).length,
    attachments: (await db.select().from(attachments)).length,
    events: (await db.select().from(runEvents)).length,
    tests: (await db.select().from(tests)).length,
    tokens: (await db.select().from(apiTokens)).length,
  };
}

describe('deleting a project', () => {
  test('cascades through runs, results, attempts, attachments, events and tokens', async ({ db, tenant, actor }) => {
    await seedRun(tenant);
    const before = await counts(db);
    expect(before).toMatchObject({ runs: 1, shards: 1, results: 1, attempts: 1, attachments: 1, tests: 1, tokens: 1 });
    expect(before.events).toBeGreaterThan(0);

    actor.signIn(tenant.adminUser);
    expect(await deleteProject(tenant.team.slug, tenant.project.slug, tenant.project.slug)).toEqual({ ok: true });

    expect(await counts(db)).toEqual({ runs: 0, shards: 0, results: 0, attempts: 0, attachments: 0, events: 0, tests: 0, tokens: 0 });
    expect(await db.select().from(projects)).toHaveLength(0);
    // The team itself survives.
    expect(await db.select().from(teams)).toHaveLength(1);
  });

  test('deletes the artifact bytes after the rows are gone', async ({ db, tenant, actor, storage }) => {
    const { ref } = await seedRun(tenant);
    const [row] = await db.select().from(attachments).where(eq(attachments.id, ref.id));
    await storeUpload(row, new Blob([new Uint8Array([1, 2, 3])]).stream(), 'image/png');
    expect(await readdir(path.join(storage, 'projects'))).toHaveLength(1);

    actor.signIn(tenant.adminUser);
    await deleteProject(tenant.team.slug, tenant.project.slug, tenant.project.slug);

    // The delete is fire-and-forget, so it lands just after the action returns.
    await vi.waitFor(async () => {
      const remaining = await readdir(path.join(storage, 'projects', tenant.project.id, 'runs'), { recursive: true });
      expect(remaining.filter((entry) => entry.endsWith('.png'))).toEqual([]);
    });
  });

  test('needs the slug typed as confirmation', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await deleteProject(tenant.team.slug, tenant.project.slug, 'wrong')).toMatchObject({
      ok: false,
      message: expect.stringContaining('confirm'),
    });
    expect(await db.select().from(projects)).toHaveLength(1);
  });

  test('records how many artifacts went with it', async ({ db, tenant, actor }) => {
    await seedRun(tenant);
    actor.signIn(tenant.adminUser);
    await deleteProject(tenant.team.slug, tenant.project.slug, tenant.project.slug);

    const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'project.delete'));
    expect(entry.target).toMatchObject({ slug: tenant.project.slug, attachments: 1 });
    // The audit row outlives the project, and keeps pointing at it.
    expect(entry.projectId).toBe(tenant.project.id);
  });

  test('leaves another team’s project untouched', async ({ db, tenant, actor }) => {
    const other = await createTenant(db);
    await seedRun(other);
    actor.signIn(tenant.adminUser);

    await deleteProject(tenant.team.slug, tenant.project.slug, tenant.project.slug);
    expect(await db.select().from(projects).where(eq(projects.id, other.project.id))).toHaveLength(1);
    expect(await db.select().from(runs)).toHaveLength(1);
  });
});

describe('deleting a team', () => {
  test('takes its projects, members and invitations with it', async ({ db, tenant, actor }) => {
    await seedRun(tenant);
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(tenant.adminUser);
    await import('@/app/(app)/teams/[team]/settings/actions').then((m) => m.inviteMember(tenant.team.slug, 'pending@example.test', 'member'));
    expect(await db.select().from(teamInvitations)).toHaveLength(1);

    actor.signIn(root);
    expect(await deleteTeam(tenant.team.id, tenant.team.slug)).toEqual({ ok: true });

    expect(await db.select().from(teams)).toHaveLength(0);
    expect(await db.select().from(projects)).toHaveLength(0);
    expect(await db.select().from(teamMembers)).toHaveLength(0);
    expect(await db.select().from(teamInvitations)).toHaveLength(0);
    expect(await counts(db)).toMatchObject({ runs: 0, results: 0, attachments: 0 });
    // Users are not team-owned and stay.
    expect((await db.select().from(users)).length).toBeGreaterThan(0);
  });

  test('is superadmin-only and needs the slug as confirmation', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    expect(await deleteTeam(tenant.team.id, tenant.team.slug)).toMatchObject({ ok: false, message: 'Superadmins only.' });

    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(root);
    expect(await deleteTeam(tenant.team.id, 'nope')).toMatchObject({ ok: false, message: expect.stringContaining('confirm') });
    expect(await db.select().from(teams)).toHaveLength(1);
  });

  test('createTeam makes the creating superadmin an admin member', async ({ db, actor }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(root);

    expect(await createTeam('Fresh Team', 'fresh')).toEqual({ ok: true, slug: 'fresh' });
    const [team] = await db.select().from(teams).where(eq(teams.slug, 'fresh'));
    const [membership] = await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id));
    expect(membership).toMatchObject({ userId: root.id, role: 'admin' });
  });

  test('createTeam refuses a slug that is already taken', async ({ db, tenant, actor }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(root);
    expect(await createTeam('Clash', tenant.team.slug)).toMatchObject({ ok: false, message: expect.stringContaining('already taken') });
  });
});

describe('deleting a user', () => {
  test('cascades the memberships but leaves the audit trail behind', async ({ db, tenant, actor }) => {
    const member = await createMember(db, tenant.team.id, 'member');
    const root = await createUserRow(db, { instanceRole: 'superadmin' });

    // Something the member did, recorded before they are removed.
    await db.insert(auditLogs).values({ action: 'member.join', actorId: member.id, teamId: tenant.team.id, target: {} });

    actor.signIn(root);
    expect(await deleteUserAccount(member.id)).toEqual({ ok: true });

    expect(await db.select().from(users).where(eq(users.id, member.id))).toHaveLength(0);
    expect(await db.select().from(teamMembers).where(eq(teamMembers.userId, member.id))).toHaveLength(0);

    const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'member.join'));
    expect(entry).toBeDefined();
    // `on delete set null`, so the row survives without an actor.
    expect(entry.actorId).toBeNull();
  });

  test('a superadmin cannot delete their own account', async ({ db, actor }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(root);
    expect(await deleteUserAccount(root.id)).toMatchObject({ ok: false, message: expect.stringContaining('your own') });
    expect(await db.select().from(users).where(eq(users.id, root.id))).toHaveLength(1);
  });

  test('a deleted creator leaves the team and project standing', async ({ db, tenant, actor }) => {
    const root = await createUserRow(db, { instanceRole: 'superadmin' });
    actor.signIn(root);

    await deleteUserAccount(tenant.adminUser.id);

    const [team] = await db.select().from(teams).where(eq(teams.id, tenant.team.id));
    const [project] = await db.select().from(projects).where(eq(projects.id, tenant.project.id));
    expect(team.createdBy).toBeNull();
    expect(project.createdBy).toBeNull();
    // The ingest token survives its creator, so CI keeps working.
    const [token] = await db.select().from(apiTokens);
    expect(token.createdBy).toBeNull();
  });
});

describe('constraints', () => {
  test('a run number is unique per project but repeats across projects', async ({ db, tenant }) => {
    const other = await createTenant(db);
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    await playRun(other.tokenProject, { tests: [{ outcome: 'passed' }] });

    const rows = await db.select({ number: runs.number }).from(runs);
    expect(rows.map((r) => r.number)).toEqual([1, 1]);

    await expect(
      db.insert(runs).values({ id: randomUUID(), projectId: tenant.project.id, number: 1, ciRunId: 'clash', startedAt: new Date() }),
    ).rejects.toSatisfy((error) => pgError(error).constraint_name === 'runs_project_number_idx');
  });

  test('a ciRunId is unique per project', async ({ db, tenant }) => {
    await playRun(tenant.tokenProject, { ciRunId: 'build-1', tests: [{ outcome: 'passed' }] });
    await expect(
      db.insert(runs).values({ id: randomUUID(), projectId: tenant.project.id, number: 99, ciRunId: 'build-1', startedAt: new Date() }),
    ).rejects.toSatisfy((error) => pgError(error).constraint_name === 'runs_project_ci_run_idx');
  });

  test('a shard index is unique per run', async ({ db, tenant }) => {
    const { runId } = await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    await expect(
      db.insert(runShards).values({ runId, shardIndex: 1, startedAt: new Date() }),
    ).rejects.toSatisfy((error) => pgError(error).constraint_name === 'run_shards_run_id_shard_index_pk');
  });

  test('an attempt is unique per (result, retry)', async ({ db, tenant }) => {
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    const [attempt] = await db.select().from(testAttempts);
    await expect(
      db.insert(testAttempts).values({ ...attempt, id: randomUUID() }),
    ).rejects.toSatisfy((error) => pgError(error).constraint_name === 'test_attempts_result_retry_idx');
  });

  test('a token hash is unique across the whole instance', async ({ db, tenant }) => {
    const other = await createTenant(db);
    const [token] = await db.select().from(apiTokens).where(eq(apiTokens.projectId, tenant.project.id));
    await expect(
      db.insert(apiTokens).values({ ...token, id: randomUUID(), projectId: other.project.id }),
    ).rejects.toSatisfy((error) => pgError(error).code === '23505');
  });

  test('an email is unique regardless of case', async ({ db, tenant }) => {
    await expect(
      db.insert(users).values({ id: randomUUID(), name: 'Clash', email: tenant.adminUser.email.toUpperCase() }),
    ).rejects.toSatisfy((error) => pgError(error).constraint_name === 'users_email_lower_idx');
  });

  test('a membership exists at most once per (team, user)', async ({ db, tenant }) => {
    await expect(
      db.insert(teamMembers).values({ teamId: tenant.team.id, userId: tenant.adminUser.id, role: 'viewer' }),
    ).rejects.toSatisfy((error) => pgError(error).constraint_name === 'team_members_team_id_user_id_pk');
  });

  test('one result per (run, test)', async ({ db, tenant }) => {
    await playRun(tenant.tokenProject, { tests: [{ outcome: 'passed' }] });
    const [result] = await db.select().from(testResults);
    await expect(
      db.insert(testResults).values({ ...result, id: randomUUID() }),
    ).rejects.toSatisfy((error) => pgError(error).constraint_name === 'test_results_run_test_idx');
  });
});
