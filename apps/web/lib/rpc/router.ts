/**
 * The app's own RPC API: the data client components load after the page has
 * rendered, served by oRPC's RPC protocol under `/api/rpc` and consumed through
 * TanStack Query (`lib/rpc/client.ts`).
 *
 * Unlike the public REST API (`lib/api`) this is not a contract: it changes
 * with the UI, is typed end to end by `RouterClient<AppRouter>` instead of
 * OpenAPI, and authenticates with the Better Auth session cookie. Dates and
 * other non-JSON values survive the trip, so the views get what the queries
 * return.
 *
 * Every project procedure resolves the project through `lib/auth/access.ts`
 * first, and answers NOT_FOUND for a project the caller cannot read — the same
 * 404 the pages give. The `admin` procedures do the same for anyone who is not
 * a superadmin.
 */
import 'server-only';
import { ORPCError, os } from '@orpc/server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getCurrentUser, resolveProject } from '@/lib/auth/access';
import { policyFromForm as dataPolicyFromForm } from '@/lib/data-retention';
import { duePreview } from '@/lib/data-retention/stats';
import { db } from '@/lib/db/drizzle';
import { getTestOverview } from '@/lib/db/queries/explorer';
import { listAutomatedTests } from '@/lib/db/queries/test-cases';
import { caseListView } from '@/lib/test-cases/case-list-view';
import {
  getRunSummary,
  listRunErrorGroupsWithCursor,
  listRunItems,
  listRunResults,
  listRunResultsWithCursor,
  listRunSpecsWithCursor,
} from '@/lib/db/queries/runs';
import { isUuid, parseRange } from '@/lib/db/queries/shared';
import { runs } from '@/lib/db/schema';
import { policyFromForm as artifactPolicyFromForm, retentionStats } from '@/lib/storage/retention';
import { toRunHeaderData, toRunListItem } from '@/lib/view-models';
import { requestComparison } from '@/lib/review/diff/compare';
import { diffsEnabled, requestCaptureDiff } from '@/lib/review/diff/dispatch';
import { needsPlanning } from '@/lib/review/diff/store';
import { REVIEW_DECISIONS } from '@miguelfranken/ui/lib/review';
import { afterCapturesShown } from '@/lib/review/diff/dispatch';
import { casesOfTests } from '@/lib/review/cases';
import { captureInProject, decide, MAX_DECISION_CAPTURES, ReviewError, runReview } from '@/lib/review/queries';
import { toRunReviewData } from '@/lib/review/run-flows';
import { pendingDiff, toDiffView } from '@/lib/review/view-model';
import { MAX_AUDIO_BYTES } from '@/lib/transcription/config';
import { canDictate, transcribeAudio } from '@/lib/transcription/transcribe';

/** How many runs or result rows one call may ask for; the live views ask in batches of these sizes. */
export const MAX_RUN_IDS = 25;
export const MAX_RESULT_IDS = 100;

const project = z.object({ team: z.string(), project: z.string() });
const run = project.extend({ runId: z.string() });
/** Ids that are not UUIDs are dropped rather than rejected, as the pages' own lists are. */
const ids = (max: number) => z.array(z.string()).transform((list) => list.filter(isUuid).slice(0, max));

const authed = os.use(async ({ next }) => {
  if (!(await getCurrentUser())) throw new ORPCError('UNAUTHORIZED');
  return next();
});

/** Admin procedures answer NOT_FOUND to anyone else — the same 404 the admin pages give. */
const superadmin = authed.use(async ({ next }) => {
  if (!(await getCurrentUser())?.isSuperadmin) throw new ORPCError('NOT_FOUND');
  return next();
});

/**
 * A policy form's fields as the form would post them. The preview parses them
 * with the save action's own `policyFromForm`, so it refuses exactly what the
 * save would, with the same message.
 */
const formFields = z
  .record(z.string().max(64), z.string().max(64))
  .refine((fields) => Object.keys(fields).length <= 32, 'Too many fields');
const formOf = (fields: Record<string, string>) => ({ get: (name: string) => fields[name] ?? null });

async function readableProjectId(team: string, slug: string): Promise<string> {
  const access = await resolveProject(team, slug);
  if (!access?.can({ run: ['read'] })) throw new ORPCError('NOT_FOUND');
  return access.project.id;
}

async function readableRun(input: z.infer<typeof run>) {
  if (!isUuid(input.runId)) throw new ORPCError('NOT_FOUND');
  const projectId = await readableProjectId(input.team, input.project);
  const [found] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.id, input.runId), eq(runs.projectId, projectId)))
    .limit(1);
  if (!found) throw new ORPCError('NOT_FOUND');
  return { projectId, runId: found.id };
}

export const appRouter = {
  runs: {
    /** Runs by id, as the runs lists render them: a list that sees `run.started` inserts the run in place. */
    items: authed.input(project.extend({ ids: ids(MAX_RUN_IDS) })).handler(async ({ input }) => {
      const projectId = await readableProjectId(input.team, input.project);
      return { runs: (await listRunItems(projectId, input.ids)).map(toRunListItem) };
    }),

    /**
     * Result rows by id, as the summary table renders them. A live view knows a
     * new result from its event and fetches the rest — its history, its
     * uploads — for exactly the rows on screen.
     */
    results: authed.input(run.extend({ ids: ids(MAX_RESULT_IDS) })).handler(async ({ input }) => {
      const { runId } = await readableRun(input);
      return { rows: input.ids.length ? await listRunResults(runId, { ids: input.ids }) : [] };
    }),

    /**
     * Every result row of a run — or of one spec file — with the cursor the
     * live store follows it from. The summary tab paints its failing files
     * first and takes the whole run from here; the specs tab opens a file
     * from here without a navigation. Filtering happens in the browser.
     */
    rows: authed.input(run.extend({ file: z.string().optional() })).handler(async ({ input }) => {
      const { runId } = await readableRun(input);
      return listRunResultsWithCursor(runId, { file: input.file });
    }),

    /** A run's per-file tallies, for the specs tab opened without a navigation. */
    specs: authed.input(run).handler(async ({ input }) => {
      const { runId } = await readableRun(input);
      return listRunSpecsWithCursor(runId);
    }),

    /** A run's error groups, for the errors tab opened without a navigation. */
    errors: authed.input(run).handler(async ({ input }) => {
      const { runId } = await readableRun(input);
      return listRunErrorGroupsWithCursor(runId);
    }),

    /**
     * A run's header data and, on request, its spec tallies and error groups. A
     * live run page settles on these once the run has finished — finishing
     * settles results in bulk, without an event per result — instead of
     * re-rendering the whole route.
     */
    summary: authed.input(run.extend({ parts: z.array(z.enum(['specs', 'errors'])).default([]) })).handler(async ({ input }) => {
      const { projectId, runId } = await readableRun(input);
      const [summary, specs, errors] = await Promise.all([
        getRunSummary(projectId, runId),
        input.parts.includes('specs') ? listRunSpecsWithCursor(runId) : null,
        input.parts.includes('errors') ? listRunErrorGroupsWithCursor(runId) : null,
      ]);
      if (!summary) throw new ORPCError('NOT_FOUND');
      const { counts, shards, cursor, ...header } = summary;
      return { header: { run: toRunHeaderData(header), counts, shards }, cursor, specs: specs?.specs ?? null, errors: errors?.groups ?? null };
    }),
  },

  tests: {
    /**
     * The explorer drawer's data, fetched after it has already opened: a row
     * click opens the drawer from what the list row holds, and this fills in
     * the history, the errors and the per-environment breakdown.
     */
    overview: authed.input(project.extend({ testId: z.string(), days: z.number().int() })).handler(async ({ input }) => {
      const projectId = await readableProjectId(input.team, input.project);
      const overview = await getTestOverview(projectId, input.testId, parseRange(String(input.days), 30));
      if (!overview) throw new ORPCError('NOT_FOUND');
      return overview;
    }),
  },

  testCases: {
    /**
     * Playwright tests for the link and adopt pickers, searched as the user
     * types. `uncovered` keeps the tests no case links to yet.
     */
    automatedTests: authed
      .input(project.extend({ q: z.string().max(200).default(''), uncovered: z.boolean().default(false) }))
      .handler(async ({ input }) => {
        const access = await resolveProject(input.team, input.project);
        if (!access?.can({ testCase: ['read'] })) throw new ORPCError('NOT_FOUND');
        return listAutomatedTests(access.project.id, { q: input.q, uncovered: input.uncovered, limit: 100 });
      }),

    /**
     * One page of the case list for its query string (`caseListKey`). The
     * list page renders the same answer into the cache (`caseListQuery`); the
     * browser asks for it when a filter, the sort, the page or the suite
     * changes to a list it has not seen lately.
     */
    list: authed.input(project.extend({ query: z.string().max(4000) })).handler(async ({ input }) => {
      const access = await resolveProject(input.team, input.project);
      if (!access?.can({ testCase: ['read'] })) throw new ORPCError('NOT_FOUND');
      return caseListView(access.project.id, input.query, new Date());
    }),
  },

  review: {
    /**
     * A run's review as its storyboard shows it. The page renders the same
     * answer into the cache (`runReviewQuery`); the browser asks for it again
     * only when that is gone or after a decision failed.
     */
    run: authed.input(project.extend({ runNumber: z.number().int().positive() })).handler(async ({ input }) => {
      const projectId = await readableProjectId(input.team, input.project);
      const [found] = await db
        .select({ id: runs.id, number: runs.number, startedAt: runs.startedAt })
        .from(runs)
        .where(and(eq(runs.projectId, projectId), eq(runs.number, input.runNumber)))
        .limit(1);
      if (!found) throw new ORPCError('NOT_FOUND');
      const records = await runReview({ id: found.id, startedAt: found.startedAt });
      afterCapturesShown(found.id, records.flatMap((r) => r.checkpoints.flatMap((c) => c.captures)));
      const byTest = await casesOfTests(projectId, records.map((r) => r.testId));
      return toRunReviewData(records, byTest, `/teams/${input.team}/projects/${input.project}`, found.number);
    }),

    /**
     * Approves images or asks for changes, from the storyboard. The storyboard
     * shows the decision in its cache at once and gets back who made it; the
     * page is not rendered again for it, so a reviewer approving one image
     * after another never waits for the whole run to be read again.
     */
    decide: authed
      .input(
        project.extend({
          captureIds: z.array(z.string()).min(1).max(MAX_DECISION_CAPTURES),
          decision: z.enum(REVIEW_DECISIONS),
          comment: z.string().max(4000).optional(),
          resolveThreads: z.boolean().optional(),
        }),
      )
      .handler(async ({ input }) => {
        const access = await resolveProject(input.team, input.project);
        if (!access?.can({ run: ['read'] })) throw new ORPCError('NOT_FOUND');
        if (!access.can({ review: ['decide'] })) throw new ORPCError('FORBIDDEN', { message: 'You do not have permission to do that.' });
        try {
          const { decided, resolvedThreads } = await decide({
            projectId: access.project.id,
            captureIds: input.captureIds,
            decision: input.decision,
            comment: input.comment,
            userId: access.user.id,
            resolveThreads: input.resolveThreads === true,
          });
          // The pages that show a status elsewhere (the queue, a run's badge) read it again on their next visit.
          revalidatePath(`/teams/${input.team}/projects/${input.project}`, 'layout');
          return { decided, resolvedThreads, by: access.user.name ?? null };
        } catch (error) {
          if (error instanceof ReviewError) throw new ORPCError('BAD_REQUEST', { message: error.message });
          throw error;
        }
      }),

    /**
     * The measured comparison of one capture with its reference, for the
     * viewer while it waits: a capture nobody measured yet is planned and
     * queued on the first call, and the viewer asks again until it is done.
     */
    diff: authed.input(project.extend({ captureId: z.string(), compareCaptureId: z.string().optional() })).handler(async ({ input }) => {
      if (!isUuid(input.captureId) || (input.compareCaptureId && !isUuid(input.compareCaptureId))) throw new ORPCError('NOT_FOUND');
      const projectId = await readableProjectId(input.team, input.project);
      const found = await captureInProject(projectId, input.captureId.toLowerCase());
      if (!found) throw new ORPCError('NOT_FOUND');
      const { capture } = found;
      if (input.compareCaptureId) {
        // The library compares two lines of work: measured against the other one's capture, not a baseline.
        const other = await captureInProject(projectId, input.compareCaptureId.toLowerCase());
        if (!other) throw new ORPCError('NOT_FOUND');
        return { diff: await requestComparison(capture, other.capture), status: capture.status, decision: null };
      }
      if (!capture.diffAgainst) return { diff: null, status: capture.status, decision: null };
      const queued = await requestCaptureDiff(capture);
      const diff = capture.diff
        ? toDiffView(capture.diff, capture.diffAgainst, capture.withinTolerance)
        : queued || needsPlanning([capture])
          ? pendingDiff(capture.diffAgainst)
          : null;
      const decision = capture.decision
        ? { decision: capture.decision.decision, by: capture.decision.by, at: capture.decision.createdAt.toISOString(), comment: capture.decision.comment, runNumber: capture.decision.runNumber, source: capture.decision.source }
        : null;
      return { diff: diffsEnabled() ? diff : null, status: capture.status, decision };
    }),
  },

  dictation: {
    /**
     * A comment's recording as text, for the composer to add to the draft.
     * Answers NOT_FOUND where the deployment does not offer dictation, as if
     * the procedure were not there.
     */
    transcribe: authed
      .input(
        z.object({
          audio: z
            .file()
            .min(1)
            .max(MAX_AUDIO_BYTES, 'That recording is too long.')
            .refine((file) => file.type === '' || file.type.startsWith('audio/'), 'Not a recording.'),
        }),
      )
      .handler(async ({ input, signal }) => {
        if (!canDictate(await getCurrentUser())) throw new ORPCError('NOT_FOUND');
        const audio = new Uint8Array(await input.audio.arrayBuffer());
        try {
          return { text: await transcribeAudio(audio, signal) };
        } catch (error) {
          console.error('[dictation] transcription failed', error);
          throw new ORPCError('BAD_GATEWAY', { message: 'That could not be transcribed. Try again.' });
        }
      }),
  },

  admin: {
    /**
     * What the data retention form would delete if saved as it is being
     * edited: the "Due" card's numbers for an unsaved policy.
     */
    dataRetentionDue: superadmin.input(z.object({ fields: formFields })).handler(async ({ input }) => {
      const policy = dataPolicyFromForm(formOf(input.fields));
      if (typeof policy === 'string') return { ok: false as const, message: policy };
      return { ok: true as const, enabled: policy.enabled, due: await duePreview(policy) };
    }),

    /** What the storage retention form would expire if saved as it is being edited, by kind. */
    artifactRetentionDue: superadmin.input(z.object({ fields: formFields })).handler(async ({ input }) => {
      const policy = artifactPolicyFromForm(formOf(input.fields));
      if (typeof policy === 'string') return { ok: false as const, message: policy };
      const rows = await retentionStats(policy);
      return { ok: true as const, enabled: policy.enabled, rows: rows.map(({ kind, dueCount, dueBytes }) => ({ kind, dueCount, dueBytes })) };
    }),
  },
};

export type AppRouter = typeof appRouter;
