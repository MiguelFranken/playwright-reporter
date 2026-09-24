import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { RunConfig } from '@miguelfranken/ui/views/run/run-config';
import { RunHeaderSkeleton } from '@miguelfranken/ui/views/run/run-header';
import { RunTabsSkeleton } from '@miguelfranken/ui/views/run/run-skeleton';
import { parseSpecSort, parseSpecStatuses } from '@miguelfranken/ui/lib/spec-filter';
import { parseRunTab } from '@/components/run/run-tab';
import { UrlRunSpecs } from '@/components/run/url-run-specs';
import { RunTabs } from '@/components/run/run-tabs';
import { UrlRunSummary } from '@/components/run/url-run-summary';
import { LiveRunErrors, LiveRunHeader } from '@/components/live/live-run';
import { LiveStoreProvider } from '@/components/live/live-store';
import { requireProject } from '@/lib/auth/access';
import { toRunHeaderData } from '@/lib/view-models';
import { getRunByNumber, listRunErrorGroupsWithCursor, listRunResults, listRunSpecsWithCursor } from '@/lib/db/queries/runs';

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
 * tab. The tab strip itself resolves as soon as `searchParams` does, so the
 * navigation is usable while the (much heavier) results query is still running.
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
  return { run: found, base: `/teams/${team}/projects/${project.slug}` };
});

async function Header({ params }: { params: Params }) {
  const { run: found, base } = await run(params);
  const { counts, shards, cursor, ...runRow } = found;
  return (
    <LiveRunHeader
      run={toRunHeaderData(runRow)}
      counts={counts}
      shards={shards}
      cursor={cursor}
      streamUrl={`/api${base}/runs/${found.id}/live`}
      pollUrl={`/api${base}/runs/${found.id}/events`}
      summaryUrl={`/api${base}/runs/${found.id}/summary`}
      resultsUrl={`/api${base}/runs/${found.id}/results`}
    />
  );
}

async function Body({ params, searchParams }: Props) {
  const sp = await searchParams;
  const tab = parseRunTab(sp.tab);
  const { run: found, base } = await run(params);
  const { counts, shards: _shards, cursor, ...runRow } = found;
  const resultsUrl = `/api${base}/runs/${found.id}/results`;

  let content: React.ReactNode;
  switch (tab) {
    case 'specs': {
      const [{ specs, cursor: specsCursor }, rows] = await Promise.all([
        listRunSpecsWithCursor(found.id),
        sp.file ? listRunResults(found.id, { file: sp.file }) : Promise.resolve(null),
      ]);
      // The whole run's spec list is sent either way — a run holds tens of
      // files, not thousands — so the search, sort and status filter are
      // applied in the browser and cost no round trip of their own.
      const specFilters = {
        q: sp.q || undefined,
        sort: parseSpecSort(sp.sort),
        status: parseSpecStatuses(sp.status),
      };
      content = (
        <UrlRunSpecs
          base={base}
          runNumber={found.number}
          specs={specs}
          specsCursor={specsCursor}
          selected={sp.file}
          rows={rows}
          cursor={cursor}
          resultsUrl={resultsUrl}
          filters={specFilters}
        />
      );
      break;
    }
    case 'errors': {
      const { groups, cursor: errorsCursor } = await listRunErrorGroupsWithCursor(found.id);
      content = <LiveRunErrors base={base} runNumber={found.number} groups={groups} cursor={errorsCursor} />;
      break;
    }
    case 'config':
      content = <RunConfig run={runRow} />;
      break;
    default: {
      const filters = { outcome: sp.outcome || undefined, q: sp.q || undefined, signature: sp.signature || undefined };
      const rows = await listRunResults(found.id, filters);
      content = (
        <UrlRunSummary
          base={base}
          runNumber={found.number}
          counts={counts}
          rows={rows}
          cursor={cursor}
          resultsUrl={resultsUrl}
          filters={filters}
        />
      );
    }
  }

  return (
    <RunTabs value={tab} counts={{ summary: counts.total }}>
      {content}
    </RunTabs>
  );
}
