import { sql, type SQL } from 'drizzle-orm';

export const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

export function parseRange(v: string | undefined, fallback: RangeDays = 30): RangeDays {
  const n = Number(v?.replace(/d$/, ''));
  return (RANGE_OPTIONS as readonly number[]).includes(n) ? (n as RangeDays) : fallback;
}

/**
 * Cut-off timestamp as an ISO string. Raw `sql` templates must receive strings, not Date objects:
 * the postgres.js driver cannot serialize untyped Date parameters in `db.execute`.
 */
export function sinceDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function parsePage(v: string | undefined) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Joins SQL fragments with AND; returns `true` when empty. */
export function andAll(parts: (SQL | undefined)[]): SQL {
  const clean = parts.filter((p): p is SQL => Boolean(p));
  if (clean.length === 0) return sql`true`;
  return sql.join(clean, sql` and `);
}

/** Reliability score expression matching lib/metrics/score.ts. `nonSkipped`, `failed`, `flaky` are SQL ints. */
export function reliabilitySql(nonSkipped: SQL, failed: SQL, flaky: SQL): SQL {
  return sql`case when ${nonSkipped} = 0 then null else greatest(0, least(100, round(100 - (${failed}::float / ${nonSkipped}) * 100 - (${flaky}::float / ${nonSkipped}) * 50)))::int end`;
}

export const FAILED_OUTCOMES = sql`('failed','timedout')`;

export function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/** Route params reach the database directly; a non-uuid would raise 22P02 there. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
