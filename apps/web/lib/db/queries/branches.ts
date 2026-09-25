import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { runs } from '@/lib/db/schema';
import { effectiveStatusRaw } from '@/lib/runs/staleness';
import { num, parseTextArray, sinceDate } from './shared';

/** Declared by the views that render them; see `@miguelfranken/ui/views/branches`. */
import type { BranchHeaderData } from '@miguelfranken/ui/views/branches/branch-header';
import type { BranchListRow } from '@miguelfranken/ui/views/branches/branches-table';

export type { BranchHeaderData, BranchListRow };

/** A run's status with stale runs counted as finished (`incomplete`), not running. */
const status = effectiveStatusRaw();

/** How many of a branch's latest runs the list row draws as a strip. */
export const RECENT_RUNS = 10;

export interface BranchListFilters {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface BranchListPage {
  rows: BranchListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Every branch with a run in the range, most recently active first. The same
 * figures as the dashboard's branch summary, plus the shape of the latest runs
 * and their typical duration, which the summary has no room for.
 */
export async function branchList(projectId: string, days: number, filters: BranchListFilters = {}): Promise<BranchListPage> {
  const q = filters.q?.trim();
  const pageSize = filters.pageSize ?? 25;
  const page = filters.page ?? 1;
  const rows = await db.execute<Record<string, unknown>>(
    sql`select git_branch as branch,
               (array_agg(environment order by started_at desc))[1] as environment,
               count(*)::int as runs,
               max(started_at) as last_run_at,
               (array_agg(number order by started_at desc))[1] as last_run_number,
               (array_agg(${status} order by started_at desc))[1] as last_status,
               (array_agg(${status}::text order by started_at desc))[1:${RECENT_RUNS}] as recent_statuses,
               avg(duration_ms) filter (where status in ('passed','failed')) as avg_duration_ms,
               case when count(*) filter (where ${status} <> 'running') = 0 then null
                    else count(*) filter (where status = 'passed')::float / count(*) filter (where ${status} <> 'running') end as pass_rate,
               -- Counted over the groups, before the limit: the page's total in the same pass.
               count(*) over ()::int as total
        from ${runs}
        where project_id = ${projectId} and started_at >= ${sinceDate(days)}
              ${q ? sql`and git_branch ilike ${'%' + q + '%'}` : sql``}
        group by git_branch order by max(started_at) desc, git_branch asc nulls last
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
  );
  const list = Array.from(rows);
  return {
    total: list.length ? num(list[0].total) : 0,
    page,
    pageSize,
    rows: list.map((r) => ({
    branch: (r.branch as string | null) ?? null,
    environment: (r.environment as string | null) ?? null,
    runs: num(r.runs),
    lastRunAt: new Date(r.last_run_at as string),
    lastRunNumber: num(r.last_run_number),
    lastStatus: String(r.last_status),
    recentStatuses: parseTextArray(r.recent_statuses),
    avgDurationMs: r.avg_duration_ms === null ? null : num(r.avg_duration_ms),
    passRate: r.pass_rate === null ? null : num(r.pass_rate),
    })),
  };
}

/** The branch as a whole, over all time — what its page's header states. `null` when it has never run. */
export async function getBranchOverview(projectId: string, branch: string): Promise<BranchHeaderData | null> {
  const [row] = await db.execute<Record<string, unknown>>(
    sql`select count(*)::int as runs,
               min(started_at) as first_run_at,
               max(started_at) as last_run_at,
               (array_agg(number order by started_at desc))[1] as last_run_number,
               (array_agg(${status} order by started_at desc))[1] as last_status,
               (array_agg(environment order by started_at desc))[1] as environment,
               (array_agg(git_message order by started_at desc))[1] as last_message,
               (array_agg(git_author_name order by started_at desc))[1] as last_author
        from ${runs} where project_id = ${projectId} and git_branch = ${branch}`,
  );
  if (!row || num(row.runs) === 0) return null;
  return {
    branch,
    runs: num(row.runs),
    firstRunAt: new Date(row.first_run_at as string),
    lastRunAt: new Date(row.last_run_at as string),
    lastRunNumber: num(row.last_run_number),
    lastStatus: String(row.last_status),
    environment: (row.environment as string | null) ?? null,
    lastMessage: (row.last_message as string | null) ?? null,
    lastAuthor: (row.last_author as string | null) ?? null,
  };
}
