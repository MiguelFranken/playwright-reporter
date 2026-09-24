/**
 * The four fixtures every integration test is built from. A test declares what
 * it needs (`test('…', async ({ db, tenant }) => …)`) and the lifecycle lives
 * here: no per-test cleanup, no random prefixes, no `afterAll` bookkeeping in
 * the suites themselves.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { test as base } from 'vitest';
import { generateToken, hashToken } from '@/lib/tokens';
import { db, client } from '@/lib/db/drizzle';
import { apiTokens, projects, teamMembers, teams, users, type Project, type Team, type TeamRole, type User } from '@/lib/db/schema';
import type { TokenProject } from '@/lib/ingest/http';
import { APP_TABLES } from './schema-tables';
import { setHeaders } from './request-context';
import { sessionOverride, type OverrideUser } from './session-override';

export type Db = typeof db;

/** One statement, so the tables are emptied atomically and FKs never get in the way. */
export async function truncateAll(database: Db = db) {
  const list = APP_TABLES.map((t) => `"${t}"`).join(', ');
  await database.execute(sql.raw(`truncate table ${list} restart identity cascade`));
}

export interface PostgresError {
  code?: string;
  constraint_name?: string;
  detail?: string;
  message: string;
}

/** Drizzle wraps driver errors; the constraint name lives on the cause. */
export function pgError(error: unknown): PostgresError {
  const cause = (error as { cause?: unknown }).cause;
  return (cause ?? error) as PostgresError;
}

export interface Tenant {
  team: Team;
  project: Project;
  /** The shape `lib/ingest/*` authenticates into. */
  tokenProject: TokenProject;
  /** The raw bearer token; only its hash is stored. */
  token: string;
  adminUser: User;
}

export interface CreateTenantOptions {
  teamSlug?: string;
  teamName?: string;
  projectSlug?: string;
  projectName?: string;
  adminEmail?: string;
  adminName?: string;
}

/** Also usable directly, e.g. to build a second team for an isolation check. */
export async function createTenant(database: Db, overrides: CreateTenantOptions = {}): Promise<Tenant> {
  const suffix = randomUUID().slice(0, 8);
  const teamSlug = overrides.teamSlug ?? `team-${suffix}`;
  const projectSlug = overrides.projectSlug ?? `project-${suffix}`;

  const [adminUser] = await database
    .insert(users)
    .values({
      id: randomUUID(),
      name: overrides.adminName ?? 'Team admin',
      email: overrides.adminEmail ?? `admin-${suffix}@example.test`,
      role: 'user',
    })
    .returning();
  const [team] = await database
    .insert(teams)
    .values({ id: randomUUID(), slug: teamSlug, name: overrides.teamName ?? `Team ${suffix}`, createdBy: adminUser.id })
    .returning();
  await database.insert(teamMembers).values({ teamId: team.id, userId: adminUser.id, role: 'admin' });
  const [project] = await database
    .insert(projects)
    .values({
      id: randomUUID(),
      teamId: team.id,
      slug: projectSlug,
      name: overrides.projectName ?? `Project ${suffix}`,
      createdBy: adminUser.id,
    })
    .returning();

  const { token, prefix } = generateToken();
  await database.insert(apiTokens).values({
    id: randomUUID(),
    projectId: project.id,
    tokenHash: hashToken(token),
    tokenPrefix: prefix,
    name: 'CI',
    createdBy: adminUser.id,
  });

  return { team, project, tokenProject: { ...project, teamSlug: team.slug }, token, adminUser };
}

/** Adds a user with a membership in an existing team. */
export async function createMember(
  database: Db,
  teamId: string,
  role: TeamRole,
  overrides: { email?: string; name?: string; instanceRole?: string } = {},
): Promise<User> {
  const suffix = randomUUID().slice(0, 8);
  const [user] = await database
    .insert(users)
    .values({
      id: randomUUID(),
      name: overrides.name ?? `User ${suffix}`,
      email: overrides.email ?? `user-${suffix}@example.test`,
      role: overrides.instanceRole ?? 'user',
    })
    .returning();
  await database.insert(teamMembers).values({ teamId, userId: user.id, role });
  return user;
}

export async function createUserRow(database: Db, overrides: { email?: string; name?: string; instanceRole?: string } = {}): Promise<User> {
  const suffix = randomUUID().slice(0, 8);
  const [user] = await database
    .insert(users)
    .values({
      id: randomUUID(),
      name: overrides.name ?? `User ${suffix}`,
      email: overrides.email ?? `user-${suffix}@example.test`,
      role: overrides.instanceRole ?? 'user',
    })
    .returning();
  return user;
}

export interface Actor {
  /** Answers `auth.api.getSession` as this user; `null` signs out. */
  signIn(user: Pick<User, 'id' | 'email' | 'name' | 'role'> | null): void;
  /** Hands the session back to the real Better Auth, e.g. after a real sign-in. */
  useRealSession(headers?: HeadersInit): void;
  /** The headers `next/headers` hands to the code under test. */
  setHeaders(init?: HeadersInit): Headers;
}

const storageRoot = () => path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? '.storage');

async function emptyStorage(root: string) {
  await mkdir(root, { recursive: true });
  const entries = await readdir(root);
  await Promise.all(entries.map((entry) => rm(path.join(root, entry), { recursive: true, force: true })));
}

export const test = base.extend<{
  db: Db;
  tenant: Tenant;
  storage: string;
  actor: Actor;
}>({
  // Truncating in *setup* means a test starts clean even after a crashed
  // predecessor, and drops the `default` team that migration 0003 seeds.
  db: async ({}, use) => {
    await truncateAll();
    await use(db);
  },
  tenant: async ({ db }, use) => {
    await use(await createTenant(db));
  },
  storage: async ({}, use) => {
    const root = storageRoot();
    await emptyStorage(root);
    await use(root);
  },
  actor: async ({ db }, use) => {
    void db; // the session refers to rows, so the database fixture must run first
    sessionOverride.current = null;
    setHeaders();
    await use({
      signIn(user) {
        sessionOverride.current = user
          ? { user: { id: user.id, email: user.email, name: user.name, role: user.role } as OverrideUser, session: {} }
          : null;
      },
      useRealSession(headers) {
        sessionOverride.current = undefined;
        setHeaders(headers);
      },
      setHeaders,
    });
    sessionOverride.current = undefined;
    setHeaders();
  },
});

export { db, client };
export { describe, expect, beforeEach, afterEach, vi } from 'vitest';
