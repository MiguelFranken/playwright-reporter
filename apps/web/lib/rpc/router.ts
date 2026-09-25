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
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getCurrentUser, resolveProject } from '@/lib/auth/access';
import { policyFromForm as dataPolicyFromForm } from '@/lib/data-retention';
import { duePreview } from '@/lib/data-retention/stats';
import { db } from '@/lib/db/drizzle';
import { getTestOverview } from '@/lib/db/queries/explorer';
import { getRunSummary, listRunErrorGroupsWithCursor, listRunItems, listRunResults, listRunSpecsWithCursor } from '@/lib/db/queries/runs';
import { isUuid, parseRange } from '@/lib/db/queries/shared';
import { runs } from '@/lib/db/schema';
import { policyFromForm as artifactPolicyFromForm, retentionStats } from '@/lib/storage/retention';
import { toRunHeaderData, toRunListItem } from '@/lib/view-models';

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
