import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { auth } from '../auth/auth';
import { baseUrl } from '../auth/config';
import { generateToken, hashToken } from '../tokens';
import { client, db } from './drizzle';
import { apiTokens, projects, teamMembers, teams, users } from './schema';

/** Idempotent: safe to re-run against an existing instance. */
async function seed() {
  const email = (process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const teamSlug = process.env.SEED_TEAM_SLUG ?? 'default';
  const projectSlug = process.env.SEED_PROJECT_SLUG ?? 'default';

  // ---------------------------------------------------------------- superadmin
  let [user] = await db.select().from(users).where(eq(users.email, email));
  let generatedPassword: string | undefined;
  if (!user) {
    const password = process.env.SEED_SUPERADMIN_PASSWORD ?? (generatedPassword = randomBytes(12).toString('base64url'));
    // `createUser` skips the session check when called without request/headers,
    // and unlike `signUpEmail` it ignores `emailAndPassword.disableSignUp`.
    await auth.api.createUser({ body: { email, password, name: process.env.SEED_SUPERADMIN_NAME ?? 'Superadmin', role: 'superadmin' } });
    [user] = await db.select().from(users).where(eq(users.email, email));
    console.log(`Created superadmin ${email}`);
  } else {
    if (user.role !== 'superadmin') {
      await db.update(users).set({ role: 'superadmin', updatedAt: new Date() }).where(eq(users.id, user.id));
      console.log(`Promoted ${email} to superadmin`);
    } else {
      console.log(`Superadmin ${email} already exists`);
    }
  }

  // ---------------------------------------------------------------------- team
  let [team] = await db.select().from(teams).where(eq(teams.slug, teamSlug));
  if (!team) {
    [team] = await db
      .insert(teams)
      .values({ id: randomUUID(), slug: teamSlug, name: process.env.SEED_TEAM_NAME ?? 'Default team', createdBy: user.id })
      .returning();
    console.log(`Created team "${team.name}" (${team.slug})`);
  } else {
    console.log(`Team "${team.name}" already exists`);
  }

  // Superadmins see every team through their instance role, but having the seed
  // user as a real member makes the local team switcher useful straight away.
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, user.id)));
  if (!membership) {
    await db.insert(teamMembers).values({ teamId: team.id, userId: user.id, role: 'admin', addedBy: user.id });
  }

  // --------------------------------------------------------- demo viewer (opt-in)
  // A read-only team member for demos, created only when SEED_VIEWER_EMAIL is set.
  const viewerEmail = process.env.SEED_VIEWER_EMAIL?.toLowerCase();
  let generatedViewerPassword: string | undefined;
  if (viewerEmail) {
    let [viewer] = await db.select().from(users).where(eq(users.email, viewerEmail));
    if (!viewer) {
      const password = process.env.SEED_VIEWER_PASSWORD ?? (generatedViewerPassword = randomBytes(12).toString('base64url'));
      await auth.api.createUser({ body: { email: viewerEmail, password, name: process.env.SEED_VIEWER_NAME ?? 'Demo viewer', role: 'user' } });
      [viewer] = await db.select().from(users).where(eq(users.email, viewerEmail));
      console.log(`Created viewer ${viewerEmail}`);
    } else {
      console.log(`Viewer ${viewerEmail} already exists`);
    }
    const [viewerMembership] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, viewer.id)));
    if (!viewerMembership) {
      await db.insert(teamMembers).values({ teamId: team.id, userId: viewer.id, role: 'viewer', addedBy: user.id });
      console.log(`Added ${viewerEmail} to team "${team.name}" as viewer`);
    }
  }

  // ------------------------------------------------------------------- project
  let [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.teamId, team.id), eq(projects.slug, projectSlug)));
  if (!project) {
    [project] = await db
      .insert(projects)
      .values({
        id: randomUUID(),
        teamId: team.id,
        slug: projectSlug,
        name: process.env.SEED_PROJECT_NAME ?? 'Default project',
        createdBy: user.id,
      })
      .returning();
    console.log(`Created project "${project.name}" (${project.slug})`);
  } else {
    console.log(`Project "${project.name}" already exists`);
  }

  // --------------------------------------------------------------- ingest token
  const { token, prefix } = generateToken();
  await db.insert(apiTokens).values({
    id: randomUUID(),
    projectId: project.id,
    tokenHash: hashToken(token),
    tokenPrefix: prefix,
    name: 'seed',
    createdBy: user.id,
  });

  console.log('\nProject API token (shown once):');
  console.log(`  ${token}`);
  if (generatedPassword) {
    console.log('\nSuperadmin password (shown once):');
    console.log(`  ${generatedPassword}`);
  }
  if (generatedViewerPassword) {
    console.log('\nViewer password (shown once):');
    console.log(`  ${generatedViewerPassword}`);
  }
  console.log(`\nSign in at ${baseUrl()}/login as ${email}\n`);

  // Convenience for local development: write the example project's .env if absent.
  const exampleEnv = path.resolve(process.cwd(), '../../examples/playwright-demo/.env');
  if (fs.existsSync(path.dirname(exampleEnv)) && !fs.existsSync(exampleEnv)) {
    fs.writeFileSync(exampleEnv, `PW_REPORTER_URL=${baseUrl()}\nPW_REPORTER_TOKEN=${token}\n`);
    console.log(`Wrote ${exampleEnv}`);
  }
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
