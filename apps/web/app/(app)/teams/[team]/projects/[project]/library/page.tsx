import { Suspense } from 'react';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { libraryRefParam, libraryRefShort, parseLibraryRef, sameLibraryRef } from '@miguelfranken/ui/lib/library';
import { ReviewStoryboardSkeleton } from '@miguelfranken/ui/views/review/review-skeleton';
import { AddToLibraryButton, ConnectedReferenceBar } from '@/components/library/library-controls';
import { UrlLibraryBrowser } from '@/components/library/url-library-browser';
import { requireProject } from '@/lib/auth/access';
import { casesOfTests, defaultBranch, getLibraryReference, libraryCandidates, libraryFlows, listLibraryReferences, listLibraryViews, markedDefaultLibraryRef, referenceRuns, renderedAt } from '@/lib/page-data';
import { compareFlowViews } from '@/lib/review/diff/compare';
import { toRunView } from '@/lib/review/library';
import { caseHref, flowViewsAcrossRuns } from '@/lib/review/view-model';
import { projectHrefs } from '@/lib/view-models';

type Props = {
  params: Promise<{ team: string; project: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The library: the product's screens and flows as the test suite captures
 * them, for a branch or pull request — the default reference unless `?ref=`
 * names another. Documentation for everyone, developer or not: nothing to
 * set up, no booking to fake to reach a screen. Who may decide can approve a
 * folder's screens from its menu in the tree.
 */
export default function LibraryPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader
        title="Library"
        description="Every flow your tests capture, screen by screen, as a branch or pull request shows it — each screen as its newest run took it, with the feedback on it. Filter to what waits for you, or keep a view of your own."
      >
        <Suspense fallback={null}>
          <AddButton params={params} />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <Bar params={params} searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<ReviewStoryboardSkeleton />}>
        <Screens params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** Resolves the route once per boundary; the reads below are request-cached. */
async function scope({ params, searchParams }: Pick<Props, 'params'> & Partial<Pick<Props, 'searchParams'>>) {
  const [{ team, project: projectSlug }, sp] = await Promise.all([params, searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  const access = await requireProject(team, projectSlug);
  const { project } = access;
  const raw = Array.isArray(sp.ref) ? sp.ref[0] : sp.ref;
  const parsed = parseLibraryRef(raw);
  // The default branch and the reference marked default are independent reads: one round trip, not two.
  const [branch, marked] = await Promise.all([defaultBranch(project.id, project.settings), parsed ? null : markedDefaultLibraryRef(project.id)]);
  const key = parsed ?? marked ?? { kind: 'branch' as const, branch };
  const rawCompare = Array.isArray(sp.compare) ? sp.compare[0] : sp.compare;
  const parsedCompare = parseLibraryRef(rawCompare);
  const compare = parsedCompare && !sameLibraryRef(parsedCompare, key) ? parsedCompare : null;
  return { team, access, project, branch, key, compare, base: `/teams/${team}/projects/${project.slug}` };
}

async function AddButton({ params }: Pick<Props, 'params'>) {
  const { team, access, project, branch, base } = await scope({ params });
  if (!access.can({ review: ['decide'] })) return null;
  const [candidates, references] = await Promise.all([libraryCandidates(project.id), listLibraryReferences(project.id, branch)]);
  return (
    <AddToLibraryButton
      team={team}
      project={project.slug}
      base={base}
      branches={candidates.branches}
      pullRequests={candidates.pullRequests}
      kept={references.filter((r) => r.kept || r.isDefault).map((r) => libraryRefParam(r.key))}
    />
  );
}

async function Bar(props: Props) {
  const { team, access, project, branch, key, compare, base } = await scope(props);
  const [references, runs, now] = await Promise.all([listLibraryReferences(project.id, branch), referenceRuns(project.id, key), renderedAt()]);
  const current = references.find((r) => sameLibraryRef(r.key, key)) ?? (await getLibraryReference(project.id, key, branch));
  const compareWith = compare ? (references.find((r) => sameLibraryRef(r.key, compare)) ?? (await getLibraryReference(project.id, compare, branch))) : null;
  return (
    <ConnectedReferenceBar
      team={team}
      project={project.slug}
      base={base}
      references={references}
      current={current}
      compareWith={compareWith}
      runs={runs.map(toRunView)}
      canManage={access.can({ review: ['decide'] })}
      now={now.toISOString()}
    />
  );
}

async function Screens(props: Props) {
  const { team, access, project, key, compare, base } = await scope(props);
  const hrefs = projectHrefs(base);
  const [records, compared, savedViews] = await Promise.all([libraryFlows(project.id, key), compare ? libraryFlows(project.id, compare) : null, listLibraryViews(project.id, access.user.id)]);
  const byTest = await casesOfTests(project.id, records.map((r) => r.testId));
  const views = flowViewsAcrossRuns(records, hrefs, { byTest, href: caseHref(hrefs) });
  const flows = compare && compared ? await compareFlowViews(views, records, compared, libraryRefShort(compare)) : views;
  return (
    <UrlLibraryBrowser
      team={team}
      project={project.slug}
      flows={flows}
      savedViews={savedViews}
      canComment={access.can({ review: ['comment'] })}
      canModerate={access.can({ project: ['delete'] })}
      canDecide={access.can({ review: ['decide'] })}
      viewerId={access.user.id}
      emptyTitle={`No screens for ${libraryRefShort(key)} yet`}
      emptyDescription={
        <>
          The library shows what the review checkpoints of a branch&apos;s or pull request&apos;s runs captured. Capture some with <code className="text-code-s">review(&apos;name&apos;)</code> from{' '}
          <code className="text-code-s">@miguelfranken/reporter/review</code>.
        </>
      }
    />
  );
}
