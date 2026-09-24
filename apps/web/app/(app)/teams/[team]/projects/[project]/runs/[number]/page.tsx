import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { RunConfig } from '@repo/ui/views/run/run-config';
import { RunErrors } from '@repo/ui/views/run/run-errors';
import { RunHeader, RunHeaderSkeleton } from '@repo/ui/views/run/run-header';
import { RunTabsSkeleton } from '@repo/ui/views/run/run-skeleton';
import { parseSpecSort, parseSpecStatuses } from '@repo/ui/lib/spec-filter';
import { parseRunTab } from '@/components/run/run-tab';
import { UrlRunSpecs } from '@/components/run/url-run-specs';
import { RunTabs } from '@/components/run/run-tabs';
import { UrlRunSummary } from '@/components/run/url-run-summary';
import { LiveRefresh } from '@/components/live/live-refresh';
import { requireProject } from '@/lib/auth/access';
import { runHrefs, toRunHeaderData } from '@/lib/view-models';
import { getRunByNumber, listRunErrorGroups, listRunResults, listRunSpecs } from '@/lib/db/queries/runs';

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
 */
export default function RunPage({ params, searchParams }: Props) {
  return (
    <>
      <Suspense fallback={<RunHeaderSkeleton />}>
        <Header params={params} />
      </Suspense>
      <Suspense fallback={<RunTabsSkeleton />}>
        <Body params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function run(params: Params) {
  const { team, project: projectSlug, number } = await params;
  const runNumber = Number(number);
  if (!Number.isInteger(runNumber) || runNumber <= 0) notFound();
  const { project } = await requireProject(team, projectSlug);
  const found = await getRunByNumber(project.id, runNumber);
  if (!found) notFound();
  return { run: found, base: `/teams/${team}/projects/${project.slug}` };
}

async function Header({ params }: { params: Params }) {
  const { run: found, base } = await run(params);
  const { counts, shards, ...runRow } = found;
  return (
    <RunHeader
      run={toRunHeaderData(runRow)}
      counts={counts}
      shards={shards}
      liveIndicator={
        <LiveRefresh
          streamUrl={`/api${base}/runs/${found.id}/live`}
          pollUrl={`/api${base}/runs/${found.id}/events`}
          enabled={found.status === 'running'}
        />
      }
    />
  );
}

async function Body({ params, searchParams }: Props) {
  const sp = await searchParams;
  const tab = parseRunTab(sp.tab);
  const { run: found, base } = await run(params);
  const { counts, shards: _shards, ...runRow } = found;

  let content: React.ReactNode;
  switch (tab) {
    case 'specs': {
      const [specs, rows] = await Promise.all([
        listRunSpecs(found.id),
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
        <UrlRunSpecs base={base} runNumber={found.number} specs={specs} selected={sp.file} rows={rows} filters={specFilters} />
      );
      break;
    }
    case 'errors':
      content = <RunErrors hrefs={runHrefs(base, found.number)} groups={await listRunErrorGroups(found.id)} />;
      break;
    case 'config':
      content = <RunConfig run={runRow} />;
      break;
    default: {
      const filters = { outcome: sp.outcome || undefined, q: sp.q || undefined, signature: sp.signature || undefined };
      const rows = await listRunResults(found.id, filters);
      content = (
        <UrlRunSummary base={base} runNumber={found.number} counts={counts} rows={rows} filters={filters} />
      );
    }
  }

  return (
    <RunTabs value={tab} counts={{ summary: counts.total }}>
      {content}
    </RunTabs>
  );
}
