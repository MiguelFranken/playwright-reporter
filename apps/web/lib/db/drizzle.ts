import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

// Next.js loads .env.local itself; standalone scripts (db:seed, db:setup) do not.
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Pooled connection for application traffic. Neon's pooler runs PgBouncer in
// transaction mode, which cannot hold server-side prepared statements.
export const client = postgres(process.env.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
