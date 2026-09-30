'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useDeferredValue, useMemo } from 'react';
import { EmptyState } from '@miguelfranken/ui/patterns/empty-state';
import { Button } from '@miguelfranken/ui/components/button';
import { TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { flattenSuites, type SuiteNode, type SuiteOption } from '@miguelfranken/ui/lib/test-case-models';
import { UrlPagination } from '@/components/filters/pagination';
import { usePendingSearch } from '@/components/filters/pending-search';
import type { ProjectRef } from '@/lib/rpc/client';
import { caseListQuery } from '@/lib/rpc/queries';
import type { CaseListView } from '@/lib/test-cases/case-list-view';
import { caseListKey, listQuery } from '@/lib/test-cases/list-params';
import { CaseList } from './case-list';

/** The skeleton the list shows while a list it has not seen yet loads; the page's Suspense shows the same one. */
export const CASE_LIST_SKELETON = <TableRowsSkeleton rows={10} columns={[8, 40, 8, 12, 16, 12]} className="panel" />;

/**
 * The case list, read from a query per filters, sort, page and suite
 * (`caseListQuery`), which the page seeds with the list it rendered.
 *
 * Those params change in place (`ShallowUrlParams`), so nothing is rendered
 * on the server for them: a list seen in the last minutes shows at once —
 * ticking an option off again, going back to a suite — and one not seen yet
 * shows its skeleton where the rows go until it arrives.
 *
 * The list follows the params one render late (`useDeferredValue`): the
 * click paints the control's new state first, and the table, which can be a
 * hundred rows, renders right after without holding that frame up.
 */
export function UrlCaseResults({
  base,
  projectRef,
  roots,
  total,
  canCreate,
  canEdit,
  canDelete,
  now,
}: {
  base: string;
  projectRef: ProjectRef;
  roots: SuiteNode[];
  total: number;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  now: Date;
}) {
  const params = useDeferredValue(usePendingSearch().params);
  const { data, isError, refetch } = useQuery(caseListQuery(projectRef, caseListKey(params)));
  const suites = useMemo(() => flattenSuites(roots), [roots]);
  return useMemo(
    () => <Results data={data} isError={isError} onRetry={() => void refetch()} params={params} base={base} projectRef={projectRef} roots={roots} suites={suites} total={total} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} now={now} />,
    // `projectRef` is a new object per server render; its slugs are what matter.
    [data, isError, refetch, params, base, projectRef.team, projectRef.project, roots, suites, total, canCreate, canEdit, canDelete, now],
  );
}

function Results({
  data,
  isError,
  onRetry,
  params,
  base,
  projectRef,
  roots,
  suites,
  total,
  canCreate,
  canEdit,
  canDelete,
  now,
}: {
  data: CaseListView | undefined;
  isError: boolean;
  onRetry: () => void;
  params: URLSearchParams;
  base: string;
  projectRef: ProjectRef;
  roots: SuiteNode[];
  suites: SuiteOption[];
  total: number;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  now: Date;
}) {
  if (!data) {
    if (isError) {
      return (
        <EmptyState icon={ClipboardList} title="The test cases did not load" description="Something went wrong on the way. Try again in a moment.">
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </EmptyState>
      );
    }
    return CASE_LIST_SKELETON;
  }

  const filtered = [...params.keys()].some((k) => k !== 'suite' && k !== 'adopt' && k !== 'page' && params.get(k));
  if (data.rows.length === 0) {
    if (total === 0) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="No test cases yet"
          description={
            canCreate
              ? 'Write a case by hand, or adopt the Playwright tests this project already runs: each becomes a case that is linked to it.'
              : 'Nobody has written a test case for this project yet.'
          }
        />
      );
    }
    return (
      <EmptyState
        icon={ClipboardList}
        title={filtered ? 'No test cases match' : 'This suite is empty'}
        description={filtered ? 'Try clearing a filter or searching for something else.' : 'Create a case here, or move cases into this suite from the list.'}
      />
    );
  }

  const suite = data.suite;
  // Moving up and down is within one suite's own cases: a suite with sub-suites lists theirs too.
  const leaf = suite === 'unassigned' || (suite !== null && !suites.some((s) => s.value !== suite && isChildOf(roots, s.value, suite)));
  return (
    <>
      <CaseList
        base={base}
        projectRef={projectRef}
        rows={data.rows}
        suites={suites}
        canEdit={canEdit}
        canDelete={canDelete}
        showSuite={suite !== 'unassigned'}
        reorderable={suite !== null && leaf && !filtered && data.sort === 'position' && data.total === data.rows.length}
        sort={data.sort}
        dir={data.dir}
        now={now}
        caseQuery={listQuery(params)}
      />
      <UrlPagination page={data.page} pageSize={data.pageSize} total={data.total} />
    </>
  );
}

function isChildOf(roots: SuiteNode[], id: string, parentId: string): boolean {
  const walk = (nodes: SuiteNode[]): boolean => nodes.some((n) => (n.id === id ? n.parentId === parentId : walk(n.children)));
  return walk(roots);
}
