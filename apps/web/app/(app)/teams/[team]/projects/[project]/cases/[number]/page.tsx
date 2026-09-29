import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CaseActions } from '@/components/test-cases/case-actions';
import { CaseDetailPanel } from '@/components/test-cases/case-detail-panel';
import { CaseHeader } from '@/components/test-cases/case-header';
import { CaseSkeleton } from '@/components/test-cases/case-skeleton';
import { requireProject } from '@/lib/auth/access';
import { Images } from 'lucide-react';
import { Button } from '@miguelfranken/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { caseKey } from '@miguelfranken/ui/lib/test-cases';
import { ReviewStoryboardSkeleton } from '@miguelfranken/ui/views/review/review-skeleton';
import { PrefetchLink } from '@/components/prefetch-link';
import { UrlReviewStoryboard } from '@/components/review/url-review-storyboard';
import { caseNeighbours, casesOfTests, defaultBranch, getCaseDetail, listFieldDefs, renderedAt, screenCatalogue } from '@/lib/page-data';
import { caseHref, screensToFlows } from '@/lib/review/view-model';
import { projectHrefs } from '@/lib/view-models';
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
      {detail.links.length ? (
        <Suspense fallback={<ReviewStoryboardSkeleton rows={1} />}>
          <CaseScreens team={team} projectSlug={project.slug} projectId={project.id} settings={project.settings} caseNumber={detail.number} testIds={detail.links.map((l) => l.testId)} />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * What the case looks like: the approved screens of its linked tests (or the
 * default branch's newest, where nobody approved one yet), in journey order.
 */
async function CaseScreens({
  team,
  projectSlug,
  projectId,
  settings,
  caseNumber,
  testIds,
}: {
  team: string;
  projectSlug: string;
  projectId: string;
  settings: Record<string, unknown>;
  caseNumber: number;
  testIds: string[];
}) {
  const base = `/teams/${team}/projects/${projectSlug}`;
  const hrefs = projectHrefs(base);
  const branch = await defaultBranch(projectId, settings);
  const [screens, byTest] = await Promise.all([screenCatalogue(projectId, branch, { testIds }), casesOfTests(projectId, testIds)]);
  if (screens.length === 0) return null;
  const flows = screensToFlows(screens, hrefs.test, { byTest, href: caseHref(hrefs) });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Images className="size-4" /> Visual review
        </CardTitle>
        <Button variant="outline" size="sm" nativeButton={false} render={<PrefetchLink href={`${base}/review/screens?q=${encodeURIComponent(caseKey(caseNumber))}`} />}>
          Open in Visual Review
        </Button>
      </CardHeader>
      <CardContent>
        <UrlReviewStoryboard team={team} project={projectSlug} flows={flows} canDecide={false} toolbar={false} tree={false} syncUrl={false} />
      </CardContent>
    </Card>
  );
}
