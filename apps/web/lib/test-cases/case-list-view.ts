/**
 * One page of the case list for a query string — what the list page renders
 * on the server and what `testCases.list` answers in the browser, built once
 * so the two agree on every row.
 */
import { listCases } from '@/lib/db/queries/test-cases';
import { parseCaseFilters, searchRecord } from './filters';

export async function caseListView(projectId: string, query: string, now: Date, list: typeof listCases = listCases) {
  const filters = parseCaseFilters(searchRecord(query));
  const result = await list(projectId, filters, now);
  return { ...result, sort: filters.sort, dir: filters.dir, suite: filters.suite ?? null };
}

export type CaseListView = Awaited<ReturnType<typeof caseListView>>;
