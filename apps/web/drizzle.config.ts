import type { Config } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

// Schema changes need a direct (non-pooled) connection: DDL and session state
// do not survive PgBouncer's transaction pooling.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL_UNPOOLED (or DATABASE_URL) environment variable is not set'
  );
}

export default {
  schema: './lib/db/schema/index.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  // The website app (apps/website) owns the `website` schema through Payload's
  // own migrations. drizzle-kit already defaults to `public`, but saying so
  // here keeps a future `pnpm db:generate` from ever proposing to drop it.
  schemaFilter: ['public'],
} satisfies Config;
