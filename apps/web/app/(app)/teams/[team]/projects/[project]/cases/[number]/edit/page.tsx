import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { flattenSuites } from '@miguelfranken/ui/lib/test-case-models';
import { CaseForm } from '@/components/test-cases/case-form';
import { CaseHeader } from '@/components/test-cases/case-header';
import { requireProject } from '@/lib/auth/access';
import { getCaseDetail, getSuiteTree, listFieldDefs, renderedAt } from '@/lib/page-data';
import { caseNumberParam, editorValues } from '@/lib/test-cases/editor';
import { CaseSkeleton } from '@/components/test-cases/case-skeleton';

type Params = Promise<{ team: string; project: string; number: string }>;

export default function EditCasePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<CaseSkeleton />}>
      <EditCase params={params} />
    </Suspense>
  );
}

async function EditCase({ params }: { params: Params }) {
  const { team, project: slug, number: raw } = await params;
  const number = caseNumberParam(raw);
  if (number === null) notFound();
  const { project } = await requireProject(team, slug, { testCase: ['update'] });
  const base = `/teams/${team}/projects/${project.slug}`;
  const [detail, tree, fieldDefs] = await Promise.all([getCaseDetail(project.id, number, await renderedAt()), getSuiteTree(project.id), listFieldDefs(project.id)]);
  if (!detail) notFound();
  return (
    <div className="flex flex-col gap-6">
      <CaseHeader base={base} detail={detail} listHref={`${base}/cases/${detail.number}`} active={null} />
      <CaseForm
        base={base}
        projectRef={{ team, project: project.slug }}
        initial={editorValues(detail)}
        suites={flattenSuites(tree.roots)}
        fieldDefs={fieldDefs}
        editing={{ caseId: detail.id, number: detail.number, version: detail.version, linkCount: detail.linkCount }}
      />
    </div>
  );
}
