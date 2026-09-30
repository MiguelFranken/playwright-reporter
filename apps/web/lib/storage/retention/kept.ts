/**
 * The review visuals retention keeps, however old — as SQL sets both sweeps
 * read: the artifact sweep keeps their bytes, the data sweep keeps the runs
 * that hold them (deleting a run takes its captures with it).
 *
 * Each set mirrors what a view actually shows, so the rules here must follow
 * `lib/review/library.ts` and `compareCaptures` in `lib/review/queries.ts`:
 * keeping a little more than a view shows is harmless, keeping less shows
 * "Deleted by retention" where documentation should be.
 *
 * The sets do not depend on the row they are checked against, so Postgres
 * plans the check as an anti-join: the set is built once per statement.
 */
import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { libraryReferences, projects, reviewCaptures, reviewCheckpoints, reviewDecisions, reviewThreads, runs, testAttempts } from '@/lib/db/schema';
import { defaultBranchSql } from '@/lib/db/queries/default-branch';

/** A kept visual, as rows of `(capture_id, attachment_id, thumbnail_attachment_id, run_id)`. */
type CaptureSet = SQL;

/**
 * The image a checkpoint is compared against: the capture of the newest
 * approval by a person (an approval the tolerance made is no baseline, see
 * `compareCaptures`). Losing it turns every later run of the checkpoint "new".
 */
const reviewBaselines: CaptureSet = sql`
  select c.id, c.attachment_id, c.thumbnail_attachment_id, c.run_id
  from ${reviewDecisions} d
  join ${reviewCaptures} c on c.id = d.capture_id
  where d.decision = 'approved' and d.source = 'human'
    and not exists (
      select 1 from ${reviewDecisions} later
      where later.test_id = d.test_id and later.checkpoint_name = d.checkpoint_name and later.variant = d.variant
        and later.decision = 'approved' and later.source = 'human'
        and (later.created_at, later.id) > (d.created_at, d.id)
    )`;

/**
 * Every reference the library lists: the kept ones, and each project's
 * default branch, which the library shows whether or not anybody kept it. A
 * pin to a run that no longer exists counts as following, as the library
 * falls back to.
 */
const libraryRefs = sql`
  select lr.project_id, lr.kind::text as kind, lr.branch, lr.pr_number,
    (select pr.id from ${runs} pr where pr.id = lr.pinned_run_id) as pinned_run_id
  from ${libraryReferences} lr
  union all
  select d.project_id, 'branch', d.branch, null::integer, null::uuid
  from (select p.id as project_id, ${defaultBranchSql({ id: sql`p.id`, settings: sql`p.settings` })} as branch from ${projects} p) d
  where not exists (
    select 1 from ${libraryReferences} lr where lr.project_id = d.project_id and lr.kind = 'branch' and lr.branch = d.branch
  )`;

/**
 * The images the library shows: every capture of a pinned run, and — for a
 * reference following its newest runs — the newest final-attempt capture of
 * each test, checkpoint and variant on it, with the one before it, which the
 * library compares against to tell an updated screen from an unchanged one.
 * Checkpoints a test no longer takes stay kept; they are few and small.
 */
const libraryScreens: CaptureSet = sql`
  select pc.id, pc.attachment_id, pc.thumbnail_attachment_id, pc.run_id
  from (${libraryRefs}) ref
  join ${reviewCaptures} pc on pc.run_id = ref.pinned_run_id
  union all
  select ranked.id, ranked.attachment_id, ranked.thumbnail_attachment_id, ranked.run_id
  from (
    select c.id, c.attachment_id, c.thumbnail_attachment_id, c.run_id,
      row_number() over (
        partition by ref.project_id, ref.kind, ref.branch, ref.pr_number, c.test_id, c.checkpoint_name, c.variant
        order by r.started_at desc, r.number desc
      ) as rank
    from (${libraryRefs}) ref
    join ${runs} r on r.project_id = ref.project_id
      and ((ref.kind = 'branch' and r.git_branch = ref.branch) or (ref.kind = 'pull_request' and r.pr_number = ref.pr_number))
    join ${reviewCaptures} c on c.run_id = r.id
    join ${reviewCheckpoints} cp on cp.id = c.checkpoint_id
    join ${testAttempts} ta on ta.id = cp.attempt_id
    where ref.pinned_run_id is null
      and ta.retry = (select max(ta2.retry) from ${testAttempts} ta2 where ta2.test_result_id = ta.test_result_id)
  ) ranked
  where ranked.rank <= 2`;

/**
 * Every image of a flow — one test's checkpoints in one run, every variant —
 * on which an open comment thread was placed. A change request points at a
 * spot on one image, but it is read against the steps around it; losing the
 * flow before the thread is resolved loses what it is about.
 */
const openThreadFlows: CaptureSet = sql`
  select c.id, c.attachment_id, c.thumbnail_attachment_id, c.run_id
  from ${reviewThreads} t
  join ${reviewCaptures} oc on oc.id = t.origin_capture_id
  join ${reviewCheckpoints} ocp on ocp.id = oc.checkpoint_id
  join ${reviewCheckpoints} cp on cp.run_id = ocp.run_id and cp.test_result_id = ocp.test_result_id
  join ${reviewCaptures} c on c.checkpoint_id = cp.id
  where t.status = 'open'`;

/**
 * The kept visuals: review baselines always; library screens and flows with
 * open threads while the artifact policy keeps visuals (`keepVisuals`).
 */
function keptCaptures(keepVisuals: boolean): CaptureSet {
  const sets = keepVisuals ? [reviewBaselines, libraryScreens, openThreadFlows] : [reviewBaselines];
  return sql.join(sets.map((s) => sql`(${s})`), sql` union all `);
}

/** Whether the attachment in `id` is a kept visual — the image or its thumbnail. */
export function isKeptAttachment(id: SQL | AnyColumn, keepVisuals: boolean): SQL {
  return sql`exists (
    select 1 from (select unnest(array[kc.attachment_id, kc.thumbnail_attachment_id]) as id from (${keptCaptures(keepVisuals)}) kc) k
    where k.id = ${id}
  )`;
}

/** Whether the run in `id` holds a kept visual. */
export function holdsKeptVisual(id: SQL | AnyColumn, keepVisuals: boolean): SQL {
  return sql`exists (select 1 from (${keptCaptures(keepVisuals)}) kc where kc.run_id = ${id})`;
}
