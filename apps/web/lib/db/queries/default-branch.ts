/**
 * A project's base branch, as SQL, so a query over many projects (the
 * retention sweeps keeping the default branch's library screens) picks the
 * same branch `defaultBranch` in `./mcp` does for one.
 */
import { sql, type SQL } from 'drizzle-orm';
import { runs } from '@/lib/db/schema';

/**
 * The branch a project without `settings.defaultBranch` measures against:
 * `main` or `master` if they have runs in 30 days, else the branch with the
 * most runs in 30 days. A project quiet for longer keeps the branch it was on
 * — `main` or `master` if they ever ran, else the newest run's — so its
 * library does not go blank. Null when the project has no run on a branch.
 */
export function fallbackBranchSql(projectId: SQL | string): SQL<string | null> {
  return sql<string | null>`coalesce(
    (select fb.git_branch from ${runs} fb
      where fb.project_id = ${projectId} and fb.git_branch is not null and fb.started_at > now() - interval '30 days'
      group by fb.git_branch
      order by fb.git_branch in ('main', 'master') desc, count(*) desc, max(fb.started_at) desc
      limit 1),
    (select fb.git_branch from ${runs} fb
      where fb.project_id = ${projectId} and fb.git_branch is not null
      group by fb.git_branch
      order by fb.git_branch in ('main', 'master') desc, max(fb.started_at) desc
      limit 1)
  )`;
}

/** `settings.defaultBranch` when set, else the fallback above, else `main`: over a Drizzle `projects` row's columns. */
export function defaultBranchSql(project: { id: SQL | string; settings: SQL }): SQL<string> {
  return sql<string>`coalesce(nullif(trim(${project.settings}->>'defaultBranch'), ''), ${fallbackBranchSql(project.id)}, 'main')`;
}
