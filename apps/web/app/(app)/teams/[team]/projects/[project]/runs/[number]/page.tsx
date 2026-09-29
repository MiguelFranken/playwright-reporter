import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cache, Suspense } from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { RunHeaderSkeleton } from '@miguelfranken/ui/views/run/run-header';
import { RunTabsSkeleton } from '@miguelfranken/ui/views/run/run-skeleton';
import { triagePrompt } from '@miguelfranken/ui/lib/ai-handoff';
import { hasResultFacets, parseResultFacets } from '@miguelfranken/ui/lib/result-filter';
import { parseRunTab } from '@/components/run/run-tab';
import { RunBody } from '@/components/run/run-body';
import type { SummaryHead } from '@/components/run/url-run-summary';
import { LiveRunHeader } from '@/components/live/live-run';
import { LiveStoreProvider } from '@/components/live/live-store';
import { requireProject } from '@/lib/auth/access';
import { baseUrl } from '@/lib/auth/config';
import { branchHref, projectHrefs, pullRequestHref, toRunHeaderData } from '@/lib/view-models';
import { listRunErrorGroupsWithCursor, listRunResults, listRunResultsWithCursor, listRunSpecsWithCursor } from '@/lib/db/queries/runs';
import { makeServerQueryClient } from '@/lib/rpc/prefetch';
import { runErrorsQuery, runRowsQuery, runSpecsQuery } from '@/lib/rpc/queries';
import { getRunByNumber } from '@/lib/page-data';

type Params = Promise<{ team: string; project: string; number: string }>;
type SearchParams = Promise<{
  tab?: string;
  outcome?: string;
  q?: string;
  file?: string;
  signature?: string;
  sort?: string;
  status?: string | string[];
  artifact?: string | string[];
  pwProject?: string | string[];
  tag?: string | string[];
  retried?: string;
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
 * Every tab's data, put into the browser's query cache (`lib/rpc/prefetch.ts`)
 * under the keys the client tabs read — after that, every tab switch, filter
 * and file happens in the browser (`RunBody`).
 *
 * The selected tab is awaited; every other tab's query is started beside it
 * and streams into the cache without holding the page up, so a switch to
 * Specs or Errors finds its answer already there instead of fetching on click.
 *
 * The summary is painted in two steps: the rows of the files holding a
 * failure — the groups that start open — and every file's tally are awaited,
 * the whole run's rows stream in behind them. A filter the head cannot answer
 * (a passed outcome, a title search) waits for all rows.
 */
async function Body({ params, searchParams }: Props) {
  // The tabs' queries are the heaviest reads in the app and are started below
  // without being awaited. A per-link prefetch renders only as far as the
  // header (private-cached, `lib/page-data.ts`); this keeps it from also
  // starting — and then discarding — the tab queries. The body streams after
  // the click, behind its skeleton.
  await connection();
  const sp = await searchParams;
  const tab = parseRunTab(sp.tab);
  const { run: found, base, runRef } = await run(params);
  const { counts, shards: _shards, cursor, ...runRow } = found;
  const queries = makeServerQueryClient();
  let summaryHead: SummaryHead | undefined;

  const loadRows = () => listRunResultsWithCursor(found.id);
  const loadSpecs = () => listRunSpecsWithCursor(found.id);
  const loadErrors = () => listRunErrorGroupsWithCursor(found.id);
  const faceted = hasResultFacets(parseResultFacets((key) => [sp[key as keyof typeof sp] ?? []].flat()));
  const narrowsOutcome = Boolean(sp.outcome && sp.outcome !== 'all');
  const summaryNeedsAll =
    tab === 'summary' && Boolean(sp.q || (narrowsOutcome ? !HEAD_OUTCOMES.has(sp.outcome!) : faceted));

  // The tabs this render does not wait for start first, beside the one it does.
  if (!summaryNeedsAll) void queries.prefetchQuery({ ...runRowsQuery(runRef), queryFn: loadRows });
  if (tab === 'errors' || tab === 'config') void queries.prefetchQuery({ ...runSpecsQuery(runRef), queryFn: loadSpecs });
  if (tab !== 'errors') void queries.prefetchQuery({ ...runErrorsQuery(runRef), queryFn: loadErrors });

  switch (tab) {
    case 'specs': {
      const [specs, rows] = await Promise.all([loadSpecs(), sp.file ? listRunResultsWithCursor(found.id, { file: sp.file }) : null]);
      queries.setQueryData(runSpecsQuery(runRef).queryKey, specs);
      if (sp.file && rows) queries.setQueryData(runRowsQuery(runRef, sp.file).queryKey, rows);
      break;
    }
    case 'errors':
      queries.setQueryData(runErrorsQuery(runRef).queryKey, await loadErrors());
      break;
    case 'config':
      break;
    default: {
      if (summaryNeedsAll) {
        queries.setQueryData(runRowsQuery(runRef).queryKey, await loadRows());
        break;
      }
      // The head's tallies are the specs tab's data too: one query serves both.
      const [rows, specs] = await Promise.all([listRunResults(found.id, { problemFiles: true }), loadSpecs()]);
      queries.setQueryData(runSpecsQuery(runRef).queryKey, specs);
      summaryHead = { rows, cursor, specs: specs.specs };
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queries)}>
      <RunBody base={base} runNumber={found.number} runRef={runRef} counts={counts} config={runRow} summaryHead={summaryHead} />
    </HydrationBoundary>
  );
}
