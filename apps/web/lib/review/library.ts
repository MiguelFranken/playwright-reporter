/**
 * The library: the branches and pull requests kept as visual documentation,
 * and the screens each one shows.
 *
 * A reference follows its newest runs — every checkpoint and variant as the
 * newest run on that branch or request captured it, so a partial run updates
 * the screens it took and leaves the rest, and a checkpoint a test no longer
 * takes drops out — or is pinned to one run, which then shows exactly that run.
 * The default branch is always in the library, kept or not; one reference is
 * the default the library opens on.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  LIBRARY_DESCRIPTION_MAX,
  LIBRARY_TITLE_MAX,
  sameLibraryRef,
  type LibraryReferencePatch,
  type LibraryReferenceView,
  type LibraryRefKey,
  type LibraryRunView,
} from '@miguelfranken/ui/lib/library';
import { db } from '@/lib/db/drizzle';
import { libraryReferences, reviewCaptures, reviewCheckpoints, runs, testAttempts, testResults, type LibraryReferenceRow } from '@/lib/db/schema';
import { mergeCheckpointOrder } from './library-order';
import { assembleFlows, capturesById, compareCaptures, isFinalAttempt, runReview, runReviewCounts, selectCheckpoints, type CheckpointRecord, type ReviewFlowRecord } from './queries';

export class LibraryError extends Error {}

/** Runs of the reference, over a Drizzle `runs` table. */
function refWhere(key: LibraryRefKey): SQL {
  return key.kind === 'branch' ? eq(runs.gitBranch, key.branch) : eq(runs.prNumber, key.prNumber);
}

const hasCaptures = sql`exists (select 1 from ${reviewCaptures} rc where rc.run_id = ${runs.id})`;

const runColumns = {
  id: runs.id,
  number: runs.number,
  status: runs.status,
  startedAt: runs.startedAt,
  commit: runs.gitShortSha,
  commitMessage: runs.gitMessage,
  branch: runs.gitBranch,
  prNumber: runs.prNumber,
  prUrl: runs.prUrl,
  prTitle: sql<string | null>`${runs.git}->>'prTitle'`,
};

type RunRow = { id: string; number: number; status: string; startedAt: Date; commit: string | null; commitMessage: string | null };

export const toRunView = (r: RunRow): LibraryRunView => ({
  number: r.number,
  status: r.status,
  startedAt: new Date(r.startedAt).toISOString(),
  commit: r.commit,
  commitMessage: r.commitMessage,
});

const keyOf = (row: Pick<LibraryReferenceRow, 'kind' | 'branch' | 'prNumber'>): LibraryRefKey =>
  row.kind === 'branch' ? { kind: 'branch', branch: row.branch! } : { kind: 'pull_request', prNumber: row.prNumber! };

/** The reference's row, if someone kept it. */
async function referenceRow(projectId: string, key: LibraryRefKey, exec: Pick<typeof db, 'select'> = db) {
  const [row] = await exec
    .select()
    .from(libraryReferences)
    .where(
      and(
        eq(libraryReferences.projectId, projectId),
        key.kind === 'branch'
          ? and(eq(libraryReferences.kind, 'branch'), eq(libraryReferences.branch, key.branch))
          : and(eq(libraryReferences.kind, 'pull_request'), eq(libraryReferences.prNumber, key.prNumber)),
      ),
    );
  return row ?? null;
}

/** The runs of a reference that carry review checkpoints, newest first: what can be pinned. */
export async function referenceRuns(projectId: string, key: LibraryRefKey, limit = 20) {
  const rows = await db
    .select(runColumns)
    .from(runs)
    .where(and(eq(runs.projectId, projectId), refWhere(key), hasCaptures))
    .orderBy(desc(runs.startedAt))
    .limit(limit);
  return rows;
}

/**
 * Every reference of the project: the kept ones and the default branch,
 * default first, then branches, then pull requests (newest activity first),
 * each with its pinned and newest run.
 */
export async function listLibraryReferences(projectId: string, defaultBranch: string): Promise<LibraryReferenceView[]> {
  const rows = await db.select().from(libraryReferences).where(eq(libraryReferences.projectId, projectId)).orderBy(libraryReferences.createdAt);
  const keys: { key: LibraryRefKey; row: LibraryReferenceRow | null }[] = rows.map((row) => ({ key: keyOf(row), row }));
  const defaultKey: LibraryRefKey = { kind: 'branch', branch: defaultBranch };
  if (!keys.some((k) => sameLibraryRef(k.key, defaultKey))) keys.unshift({ key: defaultKey, row: null });
  const hasExplicitDefault = rows.some((r) => r.isDefault);

  const views = await Promise.all(keys.map(({ key, row }) => describe(projectId, key, row, { implicitDefault: !hasExplicitDefault && sameLibraryRef(key, defaultKey) })));
  const rank = (v: LibraryReferenceView) => (v.isDefault ? 0 : v.key.kind === 'branch' ? 1 : 2);
  return views.sort((a, b) => rank(a) - rank(b) || (b.latestRun?.startedAt ?? '').localeCompare(a.latestRun?.startedAt ?? ''));
}

async function describe(projectId: string, key: LibraryRefKey, row: LibraryReferenceRow | null, { implicitDefault }: { implicitDefault: boolean }): Promise<LibraryReferenceView> {
  const [latest] = await referenceRuns(projectId, key, 1);
  const [pinned] = row?.pinnedRunId ? await db.select(runColumns).from(runs).where(eq(runs.id, row.pinnedRunId)) : [];
  let prTitle: string | null = null;
  let prUrl: string | null = null;
  let headBranch: string | null = null;
  if (key.kind === 'pull_request') {
    const [pr] = await db
      .select({
        title: sql<string | null>`(array_agg(${runs.git}->>'prTitle' order by ${runs.startedAt} desc) filter (where ${runs.git}->>'prTitle' is not null))[1]`,
        url: sql<string | null>`(array_agg(${runs.prUrl} order by ${runs.startedAt} desc) filter (where ${runs.prUrl} is not null))[1]`,
        branch: sql<string | null>`(array_agg(${runs.gitBranch} order by ${runs.startedAt} desc) filter (where ${runs.gitBranch} is not null))[1]`,
      })
      .from(runs)
      .where(and(eq(runs.projectId, projectId), eq(runs.prNumber, key.prNumber)));
    prTitle = pr?.title ?? null;
    prUrl = pr?.url ?? null;
    headBranch = pr?.branch ?? null;
  }
  const counts = latest ? (await runReviewCounts([latest.id]))[latest.id] : null;
  return {
    key,
    kept: Boolean(row),
    isDefault: row?.isDefault ?? implicitDefault,
    title: row?.title ?? null,
    description: row?.description ?? null,
    prTitle,
    prUrl,
    headBranch,
    pinnedRun: pinned ? toRunView(pinned) : null,
    latestRun: latest ? toRunView(latest) : null,
    latestCounts: counts ?? null,
  };
}

/** One reference as the library shows it, kept or not. */
export async function getLibraryReference(projectId: string, key: LibraryRefKey, defaultBranch: string): Promise<LibraryReferenceView> {
  const row = await referenceRow(projectId, key);
  const [explicitDefault] = await db
    .select({ id: libraryReferences.id })
    .from(libraryReferences)
    .where(and(eq(libraryReferences.projectId, projectId), eq(libraryReferences.isDefault, true)));
  return describe(projectId, key, row, { implicitDefault: !explicitDefault && key.kind === 'branch' && key.branch === defaultBranch });
}

/** The reference the library opens on: the one marked default, else the default branch. */
export async function defaultLibraryRef(projectId: string, defaultBranch: string): Promise<LibraryRefKey> {
  return (await markedDefaultLibraryRef(projectId)) ?? { kind: 'branch', branch: defaultBranch };
}

/** The reference marked default, if any: `defaultLibraryRef` without the fallback, so it can be read alongside the default branch. */
export async function markedDefaultLibraryRef(projectId: string): Promise<LibraryRefKey | null> {
  const [row] = await db
    .select()
    .from(libraryReferences)
    .where(and(eq(libraryReferences.projectId, projectId), eq(libraryReferences.isDefault, true)));
  return row ? keyOf(row) : null;
}

/**
 * The reference's flows: the pinned run's, or — following the newest — every
 * image as the newest run on the reference captured it (see `libraryCheckpoints`).
 */
export async function libraryFlows(projectId: string, key: LibraryRefKey, filter: { testIds?: readonly string[] } = {}): Promise<ReviewFlowRecord[]> {
  if (filter.testIds && filter.testIds.length === 0) return [];
  const row = await referenceRow(projectId, key);
  if (row?.pinnedRunId) {
    const [run] = await db.select({ id: runs.id, startedAt: runs.startedAt }).from(runs).where(eq(runs.id, row.pinnedRunId));
    if (run) {
      const flows = await runReview(run);
      return filter.testIds ? flows.filter((f) => filter.testIds!.includes(f.testId)) : flows;
    }
  }
  return assembleFlows(await libraryCheckpoints(projectId, key, filter.testIds), { byTest: true });
}

type Ranked = { captureId: string; testId: string; checkpointName: string; variant: string; checkpointId: string; runId: string; startedAt: Date; runNumber: number; rank: number };

/** Newer run first: by start, then by number for runs started in the same instant. */
const newer = (a: { startedAt: Date; runNumber: number }, b: { startedAt: Date; runNumber: number }) => +b.startedAt - +a.startedAt || b.runNumber - a.runNumber;

/**
 * The images a following reference shows: for every test, checkpoint and
 * variant, the newest capture on the reference (final attempts only), so a
 * run of some tests — or a test that failed half way — updates what it
 * captured and leaves every other image as it was.
 *
 * A checkpoint drops out once a later run of its test on the reference
 * passed, captured checkpoints, and did not capture this one in any variant:
 * the test no longer takes that screenshot. A failed, skipped or not-run test
 * never takes anything away, and neither does a run with fewer variants.
 *
 * Each capture also carries the one before it on the reference (`previous`),
 * which is what tells an updated screen from one captured again unchanged.
 */
export async function libraryCheckpoints(projectId: string, key: LibraryRefKey, testIds?: readonly string[]): Promise<CheckpointRecord[]> {
  const ranked = db.$with('ranked').as(
    db
      .select({
        captureId: reviewCaptures.id,
        testId: reviewCaptures.testId,
        checkpointName: reviewCaptures.checkpointName,
        variant: reviewCaptures.variant,
        checkpointId: reviewCaptures.checkpointId,
        runId: reviewCaptures.runId,
        startedAt: runs.startedAt,
        runNumber: runs.number,
        rank: sql<number>`row_number() over (partition by ${reviewCaptures.testId}, ${reviewCaptures.checkpointName}, ${reviewCaptures.variant} order by ${runs.startedAt} desc, ${runs.number} desc)`.as('rank'),
      })
      .from(reviewCaptures)
      .innerJoin(reviewCheckpoints, eq(reviewCheckpoints.id, reviewCaptures.checkpointId))
      .innerJoin(testAttempts, eq(testAttempts.id, reviewCheckpoints.attemptId))
      .innerJoin(runs, eq(runs.id, reviewCaptures.runId))
      .where(and(eq(reviewCaptures.projectId, projectId), refWhere(key), isFinalAttempt, testIds ? inArray(reviewCaptures.testId, [...testIds]) : undefined)),
  );
  const rows: Ranked[] = (await db.with(ranked).select().from(ranked).where(sql`${ranked.rank} <= 2`)).map((r) => ({ ...r, startedAt: new Date(r.startedAt), rank: Number(r.rank) }));
  if (rows.length === 0) return [];

  // The newest passing result of each test that captured checkpoints: what the test takes today.
  const tested = [...new Set(rows.map((r) => r.testId))];
  const passes = await db
    .selectDistinctOn([testResults.testId], { testId: testResults.testId, startedAt: runs.startedAt, runNumber: runs.number })
    .from(testResults)
    .innerJoin(runs, eq(runs.id, testResults.runId))
    .where(
      and(
        eq(runs.projectId, projectId),
        refWhere(key),
        inArray(testResults.testId, tested),
        inArray(testResults.outcome, ['passed', 'flaky']),
        sql`exists (select 1 from ${reviewCheckpoints} cp where cp.test_result_id = ${testResults.id})`,
      ),
    )
    .orderBy(testResults.testId, desc(runs.startedAt), desc(runs.number));
  const lastPass = new Map(passes.map((p) => [p.testId, { startedAt: new Date(p.startedAt), runNumber: p.runNumber }]));

  const identity = (r: Pick<Ranked, 'testId' | 'checkpointName' | 'variant'>) => `${r.testId}\u0000${r.checkpointName}\u0000${r.variant}`;
  const previousOf = new Map(rows.filter((r) => r.rank === 2).map((r) => [identity(r), r]));
  // A checkpoint is as recent as its most recent variant: a run that captured fewer variants retires none of them.
  const checkpointKey = (r: Pick<Ranked, 'testId' | 'checkpointName'>) => `${r.testId}\u0000${r.checkpointName}`;
  const latestOfCheckpoint = new Map<string, Ranked>();
  for (const r of rows) {
    const current = latestOfCheckpoint.get(checkpointKey(r));
    if (r.rank === 1 && (!current || newer(current, r) > 0)) latestOfCheckpoint.set(checkpointKey(r), r);
  }
  const shown = rows.filter((r) => {
    if (r.rank !== 1) return false;
    const pass = lastPass.get(r.testId);
    return !pass || newer(pass, latestOfCheckpoint.get(checkpointKey(r))!) >= 0;
  });
  if (shown.length === 0) return [];

  const previousRows = shown.flatMap((r) => previousOf.get(identity(r)) ?? []);
  // Every (test, run) a shown capture comes from: a superset of the runs that end up ordering a test, whose extra rows the order below never reads.
  const pairKeys = new Map(shown.map((r) => [`${r.testId}\u0000${r.runId}`, r]));
  const pairs = [...pairKeys.values()].map((r) => sql`(${r.testId}::uuid, ${r.runId}::uuid)`);
  const [metadata, raw, previous, sequences] = await Promise.all([
    selectCheckpoints(inArray(reviewCheckpoints.id, [...new Set(shown.map((r) => r.checkpointId))])),
    capturesById(shown.map((r) => r.captureId)),
    capturesById(previousRows.map((r) => r.captureId)),
    db
      .select({ testId: reviewCheckpoints.testId, runId: reviewCheckpoints.runId, name: reviewCheckpoints.name, sequence: reviewCheckpoints.sequence })
      .from(reviewCheckpoints)
      .innerJoin(testAttempts, eq(testAttempts.id, reviewCheckpoints.attemptId))
      .where(and(sql`(${reviewCheckpoints.testId}, ${reviewCheckpoints.runId}) in (${sql.join(pairs, sql`, `)})`, isFinalAttempt))
      .orderBy(reviewCheckpoints.sequence),
  ]);
  const compared = await compareCaptures(raw);
  const previousById = new Map(previous.map((c) => [c.id, c]));
  const rankOf = new Map(shown.map((r) => [r.captureId, r]));
  for (const c of compared) {
    const before = previousOf.get(identity(c));
    const capture = before ? previousById.get(before.captureId) : undefined;
    c.previous = before && capture ? { capture, runNumber: before.runNumber } : null;
    c.runNumber = rankOf.get(c.id)!.runNumber;
  }

  // One checkpoint per test and name, described by its newest capture's checkpoint.
  const cpById = new Map(metadata.map((m) => [m.id, m]));
  const byName = new Map<string, { record: CheckpointRecord; at: Ranked }>();
  for (const c of compared) {
    const at = rankOf.get(c.id)!;
    const meta = cpById.get(at.checkpointId);
    if (!meta) continue;
    const key = `${c.testId}\u0000${c.checkpointName}`;
    const existing = byName.get(key);
    if (!existing) byName.set(key, { record: { ...meta, captures: [c] }, at });
    else {
      existing.record.captures.push(c);
      if (newer(at, existing.at) < 0) byName.set(key, { record: { ...meta, captures: existing.record.captures }, at });
    }
  }

  // Each test's checkpoints in the order its runs took them, newest run first.
  const runsOfTest = new Map<string, Map<string, Ranked>>();
  for (const { at } of byName.values()) (runsOfTest.get(at.testId) ?? runsOfTest.set(at.testId, new Map()).get(at.testId)!).set(at.runId, at);

  const out: CheckpointRecord[] = [];
  for (const [testId, byRun] of runsOfTest) {
    const orders = [...byRun.values()]
      .sort(newer)
      .map((r) => sequences.filter((s) => s.testId === testId && s.runId === r.runId).map((s) => s.name));
    const records = [...byName.values()].filter((x) => x.at.testId === testId).map((x) => x.record);
    const names = mergeCheckpointOrder(orders, new Set(records.map((r) => r.name)));
    names.forEach((name, i) => {
      const record = records.find((r) => r.name === name);
      if (record) out.push({ ...record, sequence: i });
    });
  }
  return out;
}

/**
 * Keeps, changes or drops a reference. Pinning checks the run belongs to the
 * reference and has review checkpoints; making one the default unmarks the
 * previous default, in the same transaction.
 */
export async function setLibraryReference(input: { projectId: string; key: LibraryRefKey; patch: LibraryReferencePatch; userId: string | null }): Promise<{ kept: boolean }> {
  const { projectId, key, patch } = input;
  if (key.kind === 'branch' && !key.branch.trim()) throw new LibraryError('A branch needs a name.');
  const title = patch.title === undefined ? undefined : patch.title?.trim().slice(0, LIBRARY_TITLE_MAX) || null;
  const description = patch.description === undefined ? undefined : patch.description?.trim().slice(0, LIBRARY_DESCRIPTION_MAX) || null;

  let pinnedRunId: string | null | undefined;
  if (patch.pin === 'latest') pinnedRunId = null;
  else if (typeof patch.pin === 'number') {
    const [run] = await db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.projectId, projectId), eq(runs.number, patch.pin), refWhere(key), hasCaptures));
    if (!run) throw new LibraryError(`Run #${patch.pin} is not a run of ${key.kind === 'branch' ? `branch ${key.branch}` : `pull request #${key.prNumber}`} with review checkpoints.`);
    pinnedRunId = run.id;
  }

  return db.transaction(async (tx) => {
    const existing = await referenceRow(projectId, key, tx);
    if (patch.keep === false) {
      if (existing) await tx.delete(libraryReferences).where(eq(libraryReferences.id, existing.id));
      return { kept: false };
    }
    if (patch.isDefault) {
      await tx
        .update(libraryReferences)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(libraryReferences.projectId, projectId), eq(libraryReferences.isDefault, true)));
    }
    const values = {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(pinnedRunId !== undefined ? { pinnedRunId } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
    };
    if (existing) {
      await tx
        .update(libraryReferences)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(libraryReferences.id, existing.id));
    } else {
      await tx.insert(libraryReferences).values({
        id: randomUUID(),
        projectId,
        kind: key.kind,
        branch: key.kind === 'branch' ? key.branch : null,
        prNumber: key.kind === 'pull_request' ? key.prNumber : null,
        createdBy: input.userId,
        ...values,
      });
    }
    return { kept: true };
  });
}

/** Branch and pull request choices for adding a reference: those with review checkpoints, newest first. */
export async function libraryCandidates(projectId: string, limit = 50) {
  const [branches, prs] = await Promise.all([
    db
      .select({ branch: runs.gitBranch, last: sql<Date>`max(${runs.startedAt})` })
      .from(runs)
      .where(and(eq(runs.projectId, projectId), sql`${runs.gitBranch} is not null`, hasCaptures))
      .groupBy(runs.gitBranch)
      .orderBy(sql`max(${runs.startedAt}) desc`)
      .limit(limit),
    db
      .select({
        number: runs.prNumber,
        title: sql<string | null>`(array_agg(${runs.git}->>'prTitle' order by ${runs.startedAt} desc) filter (where ${runs.git}->>'prTitle' is not null))[1]`,
      })
      .from(runs)
      .where(and(eq(runs.projectId, projectId), sql`${runs.prNumber} is not null`, hasCaptures))
      .groupBy(runs.prNumber)
      .orderBy(sql`max(${runs.startedAt}) desc`)
      .limit(limit),
  ]);
  return { branches: branches.map((b) => b.branch!), pullRequests: prs.map((p) => ({ number: p.number!, title: p.title })) };
}
