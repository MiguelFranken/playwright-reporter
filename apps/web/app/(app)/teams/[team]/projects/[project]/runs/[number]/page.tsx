import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { RunHeaderSkeleton } from '@miguelfranken/ui/views/run/run-header';
import { RunTabsSkeleton } from '@miguelfranken/ui/views/run/run-skeleton';
import { triagePrompt } from '@miguelfranken/ui/lib/ai-handoff';
import { parseRunTab } from '@/components/run/run-tab';
import { RunBody } from '@/components/run/run-body';
import type { SummaryHead } from '@/components/run/url-run-summary';
import { LiveRunHeader } from '@/components/live/live-run';
import { LiveStoreProvider } from '@/components/live/live-store';
import { requireProject } from '@/lib/auth/access';
import { baseUrl } from '@/lib/auth/config';
import { branchHref, projectHrefs, pullRequestHref, toRunHeaderData } from '@/lib/view-models';
import {
  getRunByNumber,
  listRunErrorGroupsWithCursor,
  listRunResults,
  listRunResultsWithCursor,
  listRunSpecs,
  listRunSpecsWithCursor,
} from '@/lib/db/queries/runs';
import { makeServerQueryClient } from '@/lib/rpc/prefetch';
import { runErrorsQuery, runRowsQuery, runSpecsQuery } from '@/lib/rpc/queries';

type Params = Promise<{ team: string; project: string; number: string }>;
type SearchParams = Promise<{
  tab?: string;
  outcome?: string;
  q?: string;
  file?: string;
  signature?: string;
  sort?: string;
  status?: string | string[];
}>;
type Props = { params: Params; searchParams: SearchParams };

/**
 * Two boundaries: the run's identity and totals, then the body of the selected
 * tab. After the first render the body is the browser's: tabs, filters and
 * spec files switch without a navigation, from TanStack Query (`RunBody`).
 *
 * While the run is going, both halves follow one event stream through the live
 * store: the server renders the state as of an event cursor, the browser
 * applies every later event. The route is not re-rendered per event.
 */
export default function RunPage({ params, searchParams }: Props) {
  return (
    <LiveStoreProvider>
      <Suspense fallback={<RunHeaderSkeleton />}>
        <Header params={params} />
      </Suspense>
      <Suspense fallback={<RunTabsSkeleton />}>
        <Body params={params} searchParams={searchParams} />
      </Suspense>
    </LiveStoreProvider>
  );
}

/** Both boundaries need the run; one lookup per request. */
const run = cache(async (params: Params) => {
  const { team, project: projectSlug, number } = await params;
  const runNumber = Number(number);
  if (!Number.isInteger(runNumber) || runNumber <= 0) notFound();
  const { project } = await requireProject(team, projectSlug);
  const found = await getRunByNumber(project.id, runNumber);
  if (!found) notFound();
  return { run: found, base: `/teams/${team}/projects/${project.slug}`, runRef: { team, project: project.slug, runId: found.id } };
});

async function Header({ params }: { params: Params }) {
  const { run: found, base, runRef } = await run(params);
  const { counts, shards, cursor, ...runRow } = found;
  return (
    <LiveRunHeader
      run={toRunHeaderData(runRow)}
      counts={counts}
      shards={shards}
      cursor={cursor}
      streamUrl={`/api${base}/runs/${found.id}/live`}
      pollUrl={`/api${base}/runs/${found.id}/events`}
      runRef={runRef}
      branchHref={runRow.gitBranch ? branchHref(base, runRow.gitBranch) : undefined}
      pullRequestHref={runRow.prNumber ? pullRequestHref(base, runRow.prNumber) : undefined}
      // Always sent: the header shows the menu once the live counts include a failure.
      aiPrompt={triagePrompt({ runUrl: `${baseUrl()}${projectHrefs(base).run(found.number)}` })}
      aiSetupHref="/account/ai"
    />
  );
}

/** The outcomes whose rows all sit in files holding a failure, so the summary's head answers them alone. */
const HEAD_OUTCOMES = new Set(['failed', 'flaky']);

/**
 * The selected tab's data, put into the browser's query cache
 * (`lib/rpc/prefetch.ts`) under the keys the client tabs read — after that,
 * every tab switch, filter and file happens in the browser (`RunBody`).
 *
 * The summary is painted in two steps: the rows of the files holding a
 * failure — the groups that start open — and every file's tally are awaited,
 * the whole run's rows are started and stream in behind them. A filter the
 * head cannot answer (a passed outcome, a title search) waits for all rows.
 */
async function Body({ params, searchParams }: Props) {
  const sp = await searchParams;
  const tab = parseRunTab(sp.tab);
  const { run: found, base, runRef } = await run(params);
  const { counts, shards: _shards, cursor, ...runRow } = found;
  const queries = makeServerQueryClient();
  let summaryHead: SummaryHead | undefined;

  switch (tab) {
    case 'specs': {
      const [specs, rows] = await Promise.all([
        listRunSpecsWithCursor(found.id),
        sp.file ? listRunResultsWithCursor(found.id, { file: sp.file }) : null,
      ]);
      queries.setQueryData(runSpecsQuery(runRef).queryKey, specs);
      if (sp.file && rows) queries.setQueryData(runRowsQuery(runRef, sp.file).queryKey, rows);
      break;
    }
    case 'errors':
      queries.setQueryData(runErrorsQuery(runRef).queryKey, await listRunErrorGroupsWithCursor(found.id));
      break;
    case 'config':
      break;
    default: {
      const loadAll = () => listRunResultsWithCursor(found.id);
      if (sp.q || (sp.outcome && sp.outcome !== 'all' && !HEAD_OUTCOMES.has(sp.outcome))) {
        queries.setQueryData(runRowsQuery(runRef).queryKey, await loadAll());
        break;
      }
      void queries.prefetchQuery({ ...runRowsQuery(runRef), queryFn: loadAll });
      const [rows, specs] = await Promise.all([listRunResults(found.id, { problemFiles: true }), listRunSpecs(found.id)]);
      summaryHead = { rows, cursor, specs };
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queries)}>
      <RunBody base={base} runNumber={found.number} runRef={runRef} counts={counts} config={runRow} summaryHead={summaryHead} />
    </HydrationBoundary>
  );
}
