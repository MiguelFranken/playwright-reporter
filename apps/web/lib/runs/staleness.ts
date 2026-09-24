import { sql, type SQL } from 'drizzle-orm';
import { runs, type Run } from '@/lib/db/schema';

/**
 * A run is stale once it has been silent for longer than its `stale_after_ms`.
 *
 * Reads never wait for the watchdog to write that down: every query derives
 * the status the run *effectively* has, so a dead reporter's run reads as
 * `incomplete` the moment its timeout passes, on every page and stream. The
 * watchdog (see `./watchdog`) then records it, settles its results and emits
 * the `run.finished` event the live views apply.
 */

type Staleable = Pick<Run, 'status' | 'lastEventAt' | 'staleAfterMs'>;

export function staleDeadline(run: Pick<Run, 'lastEventAt' | 'staleAfterMs'>): Date {
  return new Date(run.lastEventAt.getTime() + run.staleAfterMs);
}

export function isStale(run: Staleable, now: Date = new Date()): boolean {
  return run.status === 'running' && staleDeadline(run).getTime() <= now.getTime();
}

export function effectiveStatus(run: Staleable, now?: Date): Run['status'] {
  return isStale(run, now) ? 'incomplete' : run.status;
}

// ---------------------------------------------------------------- SQL

/** Over `runs` columns as Drizzle qualifies them. */
const staleSql = sql`(${runs.status} = 'running' and ${runs.lastEventAt} + ${runs.staleAfterMs} * interval '1 millisecond' <= now())`;

export const effectiveStatusSql = sql<Run['status']>`(case when ${staleSql} then 'incomplete'::run_status else ${runs.status} end)`;

/** Running and not stale: what the active-run cards and a `running` filter mean. */
export const effectivelyRunningSql = sql`(${runs.status} = 'running' and not ${staleSql})`;

/**
 * Spread over `getTableColumns(runs)` in a select: the status — and, for a
 * stale run, its end and duration — as the run effectively has them.
 */
export const effectiveRunColumns = {
  status: effectiveStatusSql.mapWith(runs.status),
  finishedAt: sql<Date | null>`(case when ${staleSql} then ${runs.lastEventAt} else ${runs.finishedAt} end)`.mapWith(runs.finishedAt),
  durationMs: sql<number | null>`(case when ${staleSql}
    then least(2147483647, greatest(0, extract(epoch from (${runs.lastEventAt} - ${runs.startedAt})) * 1000))::int
    else ${runs.durationMs} end)`.mapWith(runs.durationMs),
};

/**
 * The effective status over raw SQL, for queries that name the columns
 * themselves. `alias` is the alias the query gives `runs`.
 */
export function effectiveStatusRaw(alias?: 'r'): SQL {
  const c = (name: string) => sql.raw(alias ? `${alias}.${name}` : name);
  return sql`(case when ${c('status')} = 'running' and ${c('last_event_at')} + ${c('stale_after_ms')} * interval '1 millisecond' <= now()
    then 'incomplete'::run_status else ${c('status')} end)`;
}
