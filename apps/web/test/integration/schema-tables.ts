import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@/lib/db/schema';

/**
 * Every application table, derived from the schema module so a new table is
 * truncated without anybody remembering to update a list. Drizzle's own
 * `drizzle.__drizzle_migrations` bookkeeping lives in another schema and is
 * deliberately untouched.
 */
export const APP_TABLES: string[] = Array.from(
  new Set(
    (Object.values(schema) as unknown[])
      .filter((value): value is PgTable => is(value, PgTable))
      .map((table) => getTableName(table)),
  ),
).sort();
