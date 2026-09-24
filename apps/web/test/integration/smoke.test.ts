/** Proves the per-file database exists, carries the migrated schema, and starts empty. */
import { sql } from 'drizzle-orm';
import { describe, expect, test } from './fixtures';
import { APP_TABLES } from './schema-tables';

describe('integration database', () => {
  test('has every application table from the migrations', async ({ db }) => {
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const present = Array.from(rows).map((r) => r.table_name);
    for (const table of APP_TABLES) expect(present).toContain(table);
  });

  test('starts empty, including the team seeded by migration 0003', async ({ db }) => {
    for (const table of APP_TABLES) {
      const [row] = Array.from(await db.execute<{ n: string }>(sql.raw(`select count(*) as n from "${table}"`)));
      expect({ table, n: Number(row.n) }).toEqual({ table, n: 0 });
    }
  });

  test('is private to this file: a write here is invisible to other files', async ({ db, tenant }) => {
    const [row] = await db.execute<{ n: string }>(sql`select count(*) as n from projects`);
    expect(Number(row.n)).toBe(1);
    expect(tenant.project.teamId).toBe(tenant.team.id);
  });
});
