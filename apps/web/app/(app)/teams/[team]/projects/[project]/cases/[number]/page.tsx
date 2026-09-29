import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CaseActions } from '@/components/test-cases/case-actions';
import { CaseDetailPanel } from '@/components/test-cases/case-detail-panel';
import { CaseHeader } from '@/components/test-cases/case-header';
import { CaseSkeleton } from '@/components/test-cases/case-skeleton';
import { requireProject } from '@/lib/auth/access';
import { caseNeighbours, getCaseDetail, listFieldDefs, renderedAt } from '@/lib/page-data';
import { caseNumberParam } from '@/lib/test-cases/editor';
import { listQuery, parseCaseFilters } from '@/lib/test-cases/filters';

type Params = Promise<{ team: string; project: string; number: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CasePage(props: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<CaseSkeleton />}>
      <CaseContent {...props} />
    </Suspense>
  );
}

/**
 * One case. The list's filters ride along in the query string, so previous
 * and next step through the list the case was opened from.
 */
async function CaseContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ team, project: slug, number: raw }, sp] = await Promise.all([params, searchParams]);
  const number = caseNumberParam(raw);
  if (number === null) notFound();
  const access = await requireProject(team, slug);
  const { project } = access;
  const base = `/teams/${team}/projects/${project.slug}`;
  const now = await renderedAt();
  const filters = parseCaseFilters(sp);
  const [detail, fieldDefs, neighbours] = await Promise.all([
    getCaseDetail(project.id, number, now),
    listFieldDefs(project.id),
    caseNeighbours(project.id, number, { ...filters, page: undefined }),
  ]);
  if (!detail) notFound();
  const qs = listQuery(sp);
  const projectRef = { team, project: project.slug };

  return (
    <div className="flex flex-col gap-6">
      <CaseHeader
        base={base}
        detail={detail}
        listHref={`${base}/cases${qs || (detail.suiteId ? `?suite=${detail.suiteId}` : '')}`}
        active="overview"
        actions={
          <CaseActions
            base={base}
            projectRef={projectRef}
            caseId={detail.id}
            number={detail.number}
            canEdit={access.can({ testCase: ['update'] })}
            canDelete={access.can({ testCase: ['delete'] })}
          />
        }
      />
      <CaseDetailPanel
        base={base}
        projectRef={projectRef}
        detail={detail}
        fieldDefs={fieldDefs}
        canEdit={access.can({ testCase: ['update'] })}
        now={now}
        neighbours={neighbours}
        neighbourQuery={qs}
      />
    </div>
  );
}
