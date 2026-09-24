/**
 * Integration run lifecycle, once per `vitest run` in the main process.
 *
 * Resolves a PostgreSQL server (an explicit `TEST_DATABASE_URL`, or a
 * Testcontainers instance), migrates a *template* database from the real
 * `lib/db/migrations` folder, and hands its coordinates to the workers. Each
 * test file then clones the template, which costs ~50 ms instead of re-running
 * every migration.
 */
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { TEMPLATE_DB, withDatabase } from './db-url';

const IMAGE = process.env.TEST_POSTGRES_IMAGE ?? 'postgres:17-alpine';

declare module 'vitest' {
  interface ProvidedContext {
    testDb: { adminUrl: string; template: string };
  }
}

type StartedContainer = { getConnectionUri(): string; stop(): Promise<unknown> };

async function startContainer(): Promise<StartedContainer> {
  let PostgreSqlContainer: typeof import('@testcontainers/postgresql').PostgreSqlContainer;
  try {
    ({ PostgreSqlContainer } = await import('@testcontainers/postgresql'));
  } catch {
    throw new Error('@testcontainers/postgresql is not installed. Run `pnpm install`, or set TEST_DATABASE_URL.');
  }
  try {
    return await new PostgreSqlContainer(IMAGE).start();
  } catch (error) {
    throw new Error(
      `Could not start a PostgreSQL test container (${IMAGE}): ${(error as Error).message}\n\n` +
        'Start Docker Desktop, or point the tests at your own server:\n' +
        '  docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine\n' +
        '  TEST_DATABASE_URL=postgres://postgres:test@localhost:54329/postgres pnpm test:integration',
    );
  }
}

/** Refuses to run against the URL the developer's app uses, which we truncate and drop databases on. */
function assertNotDeveloperDatabase(url: string) {
  const forbidden = [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].filter(Boolean) as string[];
  const key = (u: string) => {
    try {
      const parsed = new URL(u);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return u;
    }
  };
  if (forbidden.some((f) => key(f) === key(url))) {
    throw new Error(
      'TEST_DATABASE_URL points at the same database as DATABASE_URL. The integration suite creates, ' +
        'truncates and drops databases — point it at a throwaway server instead.',
    );
  }
}

type Provide = <K extends 'testDb'>(key: K, value: { adminUrl: string; template: string }) => void;

export default async function setup({ provide }: { provide: Provide }) {
  // `.env.local` is only read to *reject* it below; the app's own database is never used.
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: ['.env.local', '.env'], quiet: true });

  let container: StartedContainer | undefined;
  let adminUrl = process.env.TEST_DATABASE_URL;
  if (adminUrl) {
    assertNotDeveloperDatabase(adminUrl);
  } else {
    container = await startContainer();
    adminUrl = container.getConnectionUri();
  }

  const admin = postgres(adminUrl, { max: 1, prepare: false });
  try {
    await admin.unsafe(`drop database if exists ${TEMPLATE_DB} with (force)`);
    await admin.unsafe(`create database ${TEMPLATE_DB}`);
  } finally {
    await admin.end();
  }

  const templateUrl = withDatabase(adminUrl, TEMPLATE_DB);
  const client = postgres(templateUrl, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(import.meta.dirname, '../../lib/db/migrations') });
  } finally {
    await client.end();
  }

  provide('testDb', { adminUrl, template: TEMPLATE_DB });

  return async () => {
    if (container) {
      await container.stop();
      return;
    }
    // A borrowed server keeps running; leave nothing of ours behind on it.
    const cleanup = postgres(adminUrl, { max: 1, prepare: false });
    try {
      await cleanup.unsafe(`drop database if exists ${TEMPLATE_DB} with (force)`);
    } finally {
      await cleanup.end();
    }
  };
}
