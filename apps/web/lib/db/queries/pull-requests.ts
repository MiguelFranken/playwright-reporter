import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { runs } from '@/lib/db/schema';
import { effectiveStatusRaw } from '@/lib/runs/staleness';
import { num, parseTextArray, sinceDate } from './shared';
import { RECENT_RUNS } from './branches';

/** Declared by the views that render them; see `@miguelfranken/ui/views/pull-requests`. */
import type { PullRequestHeaderData } from '@miguelfranken/ui/views/pull-requests/pull-request-header';
import type { PullRequestListRow } from '@miguelfranken/ui/views/pull-requests/pull-requests-table';

export type { PullRequestHeaderData, PullRequestListRow };

/** A run's status with stale runs counted as finished (`incomplete`), not running. */
const status = effectiveStatusRaw();

/**
 * The newest non-null value of `expr` among a pull request's runs. A title or a
 * link is reported by some runs and not others (an older reporter, a rerun
 * outside the merge request pipeline), so the latest run alone may have none.
 * The title is only in the stored git metadata, not a column of its own.
 */
const latest = (expr: SQL) =>
  sql`(array_agg(${expr} order by started_at desc) filter (where ${expr} is not null))[1]`;
const prTitle = sql`git->>'prTitle'`;

export interface PullRequestListFilters {
  q?: string;
  limit?: number;
}

/**
 * Every pull or merge request with a run in the range, most recently active
 * first: the branch list's figures, grouped by request instead of by branch.
 * A request is its number within the project; its branch, title and link are
 * whatever its latest run reported.
 */
export async function pullRequestList(projectId: string, days: number, filters: PullRequestListFilters = {}): Promise<PullRequestListRow[]> {
  const q = filters.q?.trim();
  const number = q?.replace(/^[#!]/, '');
  const rows = await db.execute<Record<string, unknown>>(
    sql`select pr_number as number,
               ${latest(prTitle)} as title,
               ${latest(sql`pr_url`)} as url,
               ${latest(sql`git_branch`)} as branch,
               (array_agg(environment order by started_at desc))[1] as environment,
               ${latest(sql`git_author_name`)} as last_author,
               count(*)::int as runs,
               max(started_at) as last_run_at,
               (array_agg(number order by started_at desc))[1] as last_run_number,
               (array_agg(${status} order by started_at desc))[1] as last_status,
               (array_agg(${status}::text order by started_at desc))[1:${RECENT_RUNS}] as recent_statuses,
               avg(duration_ms) filter (where status in ('passed','failed')) as avg_duration_ms,
               case when count(*) filter (where ${status} <> 'running') = 0 then null
                    else count(*) filter (where status = 'passed')::float / count(*) filter (where ${status} <> 'running') end as pass_rate
        from ${runs}
        where project_id = ${projectId} and pr_number is not null and started_at >= ${sinceDate(days)}
        group by pr_number
        ${
          q
            ? sql`having pr_number::text = ${number}
                     or bool_or(git_branch ilike ${'%' + q + '%'})
                     or bool_or(${prTitle} ilike ${'%' + q + '%'})`
            : sql``
        }
        order by max(started_at) desc limit ${filters.limit ?? 200}`,
  );
  return Array.from(rows).map((r) => ({
    number: num(r.number),
    title: (r.title as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    branch: (r.branch as string | null) ?? null,
    environment: (r.environment as string | null) ?? null,
    lastAuthor: (r.last_author as string | null) ?? null,
    runs: num(r.runs),
    lastRunAt: new Date(r.last_run_at as string),
    lastRunNumber: num(r.last_run_number),
    lastStatus: String(r.last_status),
    recentStatuses: parseTextArray(r.recent_statuses),
    avgDurationMs: r.avg_duration_ms === null ? null : num(r.avg_duration_ms),
    passRate: r.pass_rate === null ? null : num(r.pass_rate),
  }));
}

/** The request as a whole, over all time — what its page's header states. `null` when no run reported it. */
export async function getPullRequestOverview(projectId: string, prNumber: number): Promise<PullRequestHeaderData | null> {
  const [row] = await db.execute<Record<string, unknown>>(
    sql`select count(*)::int as runs,
               ${latest(prTitle)} as title,
               ${latest(sql`pr_url`)} as url,
               ${latest(sql`git_branch`)} as branch,
               min(started_at) as first_run_at,
               max(started_at) as last_run_at,
               (array_agg(number order by started_at desc))[1] as last_run_number,
               (array_agg(${status} order by started_at desc))[1] as last_status,
               (array_agg(environment order by started_at desc))[1] as environment,
               (array_agg(git_message order by started_at desc))[1] as last_message,
               (array_agg(git_author_name order by started_at desc))[1] as last_author
        from ${runs} where project_id = ${projectId} and pr_number = ${prNumber}`,
  );
  if (!row || num(row.runs) === 0) return null;
  return {
    number: prNumber,
    title: (row.title as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    branch: (row.branch as string | null) ?? null,
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
