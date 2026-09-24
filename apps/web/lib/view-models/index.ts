/**
 * Bridges between the database rows the query layer produces and the view
 * models `@repo/ui` declares.
 *
 * Most rows are already structurally compatible and need nothing here. The
 * mappers below exist for the fields a view deliberately does not know how to
 * compute — chiefly URLs, which depend on the git provider or on the route
 * shape the app happens to use.
 */
import type { RunHeaderData } from '@repo/ui/views/run/run-header';
import type { RunListItem } from '@repo/ui/views/runs/runs-table';

/**
 * GitHub, GitLab and Bitbucket each shape a commit URL differently. That is
 * host knowledge, so it is resolved here and the views receive a plain href.
 */
export function commitUrl(repoUrl: string | null, sha: string | null): string | null {
  if (!repoUrl || !sha) return null;
  const base = repoUrl.replace(/\.git$/, '').replace(/\/+$/, '');
  if (/gitlab/i.test(base)) return `${base}/-/commit/${sha}`;
  if (/bitbucket/i.test(base)) return `${base}/commits/${sha}`;
  return `${base}/commit/${sha}`;
}

type RunRowLike = {
  gitRepoUrl: string | null;
  gitSha: string | null;
  gitShortSha: string | null;
};

/** Adds the resolved commit URL a run row cannot produce on its own. */
export function toRunListItem<T extends RunRowLike>(run: T): T & Pick<RunListItem, 'gitCommitUrl' | 'gitShortSha'> {
  return {
    ...run,
    gitShortSha: run.gitShortSha ?? run.gitSha?.slice(0, 7) ?? null,
    gitCommitUrl: commitUrl(run.gitRepoUrl, run.gitSha),
  };
}

/** Same, for the run header — which reads the identical git fields. */
export function toRunHeaderData<T extends RunRowLike>(run: T): T & Pick<RunHeaderData, 'gitCommitUrl' | 'gitShortSha'> {
  return toRunListItem(run);
}

/** The href builders a project's views need, all rooted at one base path. */
export function projectHrefs(base: string) {
  return {
    run: (number: number) => `${base}/runs/${number}`,
    test: (testId: string) => `${base}/tests/${testId}`,
    result: (runNumber: number, resultId: string) => `${base}/runs/${runNumber}/tests/${resultId}`,
  };
}

/** The href builders a single run's tabs need. */
export function runHrefs(
  base: string,
  runNumber: number,
  filters: { q?: string; outcome?: string; sort?: string; status?: string[] } = {},
) {
  const runBase = `${base}/runs/${runNumber}`;
  const withParams = (params: Record<string, string | string[] | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) value.filter(Boolean).forEach((v) => search.append(key, v));
      else if (value) search.set(key, value);
    }
    const qs = search.toString();
    return qs ? `${runBase}?${qs}` : runBase;
  };
  return {
    result: (resultId: string) => `${runBase}/tests/${resultId}`,
    // Clicking the tile you are already filtered by clears the filter.
    outcome: (outcome: string) =>
      withParams({ q: filters.q, outcome: filters.outcome === outcome ? undefined : outcome }),
    clearFilters: runBase,
    errorGroup: (signature: string) => withParams({ signature }),
    // Opening a spec file keeps the list you picked it out of — the search,
    // the sort and the status filter all ride along.
    spec: (file: string) =>
      withParams({ tab: 'specs', file, q: filters.q, sort: filters.sort, status: filters.status }),
  };
}
