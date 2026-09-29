import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CaseHeader } from '@/components/test-cases/case-header';
import { CaseHistoryPanel } from '@/components/test-cases/case-history-panel';
import { requireProject } from '@/lib/auth/access';
import { getCaseDetail, listCaseVersions, listFieldDefs, renderedAt } from '@/lib/page-data';
import { caseNumberParam } from '@/lib/test-cases/editor';
import { CaseSkeleton } from '@/components/test-cases/case-skeleton';

type Params = Promise<{ team: string; project: string; number: string }>;

export default function CaseHistoryPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<CaseSkeleton />}>
      <History params={params} />
    </Suspense>
  );
}

async function History({ params }: { params: Params }) {
  const { team, project: slug, number: raw } = await params;
  const number = caseNumberParam(raw);
  if (number === null) notFound();
  const access = await requireProject(team, slug);
  const base = `/teams/${team}/projects/${access.project.slug}`;
  const now = await renderedAt();
  const [detail, versions, fieldDefs] = await Promise.all([
    getCaseDetail(access.project.id, number, now),
    listCaseVersions(access.project.id, number),
    listFieldDefs(access.project.id),
  ]);
  if (!detail || !versions) notFound();
  return (
    <div className="flex flex-col gap-6">
      <CaseHeader base={base} detail={detail} listHref={`${base}/cases${detail.suiteId ? `?suite=${detail.suiteId}` : ''}`} active="history" />
      <CaseHistoryPanel
        projectRef={{ team, project: access.project.slug }}
        caseId={detail.id}
        versions={versions}
        fieldDefs={fieldDefs}
        canEdit={access.can({ testCase: ['update'] })}
        now={now}
      />
    </div>
  );
}
