import { Suspense } from 'react';
import { BackLink } from '@miguelfranken/ui/patterns/back-link';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { flattenSuites } from '@miguelfranken/ui/lib/test-case-models';
import { EMPTY_CASE } from '@miguelfranken/ui/lib/test-case-editor';
import { CaseForm } from '@/components/test-cases/case-form';
import { requireProject } from '@/lib/auth/access';
import { isUuid } from '@/lib/db/queries/shared';
import { getSuiteTree, listFieldDefs } from '@/lib/page-data';

type Params = Promise<{ team: string; project: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NewCasePage(props: { params: Params; searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewCase {...props} />
      </Suspense>
    </div>
  );
}

async function NewCase({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ team, project: slug }, sp] = await Promise.all([params, searchParams]);
  const { project } = await requireProject(team, slug, { testCase: ['create'] });
  const base = `/teams/${team}/projects/${project.slug}`;
  const [tree, fieldDefs] = await Promise.all([getSuiteTree(project.id), listFieldDefs(project.id)]);
  const suites = flattenSuites(tree.roots);
  const wanted = typeof sp.suite === 'string' && isUuid(sp.suite) ? sp.suite : null;
  const suiteId = wanted && suites.some((s) => s.value === wanted) ? wanted : null;
  return (
    <>
      <BackLink href={`${base}/cases${suiteId ? `?suite=${suiteId}` : ''}`}>Test Cases</BackLink>
      <PageHeader title="New test case" description="Link it to a Playwright test later by tagging the test with its key, such as @TC-12." />
      <CaseForm base={base} projectRef={{ team, project: project.slug }} initial={{ ...EMPTY_CASE, suiteId }} suites={suites} fieldDefs={fieldDefs} />
    </>
  );
}
