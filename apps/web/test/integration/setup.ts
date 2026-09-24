/**
 * Per-file integration setup, in the worker process.
 *
 * Runs before the test file's own imports, which is what lets it point
 * `DATABASE_URL` at a private clone of the migrated template *before* the
 * module-level singleton in `lib/db/drizzle.ts` is constructed. Vitest's forks
 * pool isolates the module graph per file, so every file gets its own database
 * and its own connection pool.
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, inject, vi } from 'vitest';
import { withDatabase } from './db-url';

vi.mock('next/headers', () => ({
  headers: async () => (await import('./request-context')).currentHeaders(),
  cookies: async () => {
    throw new Error('cookies() is not available in integration tests');
  },
}));

// `revalidatePath`/`revalidateTag` throw outside a request scope; the Server
// Actions under test call them as their last step.
vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: (fn: unknown) => fn,
}));

/**
 * Better Auth itself stays real — only `getSession` gets a bypass, so the
 * `actor` fixture can sign somebody in without a scrypt hash per test. With no
 * override set the call goes straight through to the real implementation.
 */
vi.mock('@/lib/auth/auth', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/auth/auth')>();
  const { sessionOverride } = await import('./session-override');
  const api = new Proxy(mod.auth.api, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== 'getSession') return value;
      return async (...args: unknown[]) =>
        sessionOverride.current === undefined ? (value as (...a: unknown[]) => unknown)(...args) : sessionOverride.current;
    },
  });
  const auth = new Proxy(mod.auth, {
    get: (target, prop, receiver) => (prop === 'api' ? api : Reflect.get(target, prop, receiver)),
  });
  return { ...mod, auth };
});

const { adminUrl, template } = inject('testDb');
const database = `test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const admin = postgres(adminUrl, { max: 1, prepare: false });
await admin.unsafe(`create database ${database} template ${template}`);
await admin.end();

const databaseUrl = withDatabase(adminUrl, database);
process.env.DATABASE_URL = databaseUrl;
process.env.DATABASE_URL_UNPOOLED = databaseUrl;

// `getStorage()` caches its adapter, so the directory is fixed per file; the
// `storage` fixture only empties it between tests.
const storageDir = await mkdtemp(path.join(tmpdir(), 'pwr-storage-'));
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = storageDir;
process.env.BASE_URL = 'http://test.local';
process.env.BETTER_AUTH_SECRET = 'integration-test-secret-0123456789abcdef0123456789abcdef';
process.env.INGEST_MAX_BATCH_BYTES ??= String(4 * 1024 * 1024);
// No workflow runtime here: runs read as stale, and tests close them through
// `checkStaleRun`, the watchdog's step, directly.
process.env.RUN_WATCHDOG_DRIVER = 'none';
delete process.env.RUN_STALE_TIMEOUT_MS;

export const storageRoot = storageDir;

afterAll(async () => {
  const { client } = await import('@/lib/db/drizzle');
  await client.end({ timeout: 5 }).catch(() => undefined);
  const cleanup = postgres(adminUrl, { max: 1, prepare: false });
  try {
    await cleanup.unsafe(`drop database if exists ${database} with (force)`);
  } finally {
    await cleanup.end();
  }
  await rm(storageDir, { recursive: true, force: true });
});
