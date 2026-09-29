import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { BackLink } from '@miguelfranken/ui/patterns/back-link';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ReviewStoryboardSkeleton } from '@miguelfranken/ui/views/review/review-skeleton';
import { GitBranch, GitPullRequest } from 'lucide-react';
import type { LibraryRefKey } from '@miguelfranken/ui/lib/library';
import { ConnectedRunLibraryActions } from '@/components/library/library-controls';
import { PrefetchLink } from '@/components/prefetch-link';
import { UrlReviewStoryboard } from '@/components/review/url-review-storyboard';
import { requireProject } from '@/lib/auth/access';
import { casesOfTests, defaultBranch, getLibraryReference, getRunByNumber, runReview } from '@/lib/page-data';
import { afterCapturesShown } from '@/lib/review/diff/dispatch';
import { caseHref, toFlowViews } from '@/lib/review/view-model';
import { projectHrefs } from '@/lib/view-models';

type Props = { params: Promise<{ team: string; project: string; number: string }> };

/**
 * A run's review checkpoints as a storyboard: what every journey looked like,
 * desktop beside mobile, and which images still need a reviewer's eye.
 */
export default function RunReviewPage({ params }: Props) {
  return (
    <Suspense fallback={<ReviewStoryboardSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Props) {
  const { team, project: projectSlug, number } = await params;
  const runNumber = Number(number);
  if (!Number.isInteger(runNumber) || runNumber <= 0) notFound();
  const access = await requireProject(team, projectSlug);
  const run = await getRunByNumber(access.project.id, runNumber);
  if (!run) notFound();
  const base = `/teams/${team}/projects/${access.project.slug}`;
  const hrefs = projectHrefs(base);
  const records = await runReview({ id: run.id, startedAt: new Date(run.startedAt).toISOString() });
  // Comparisons nobody measured yet (a baseline approved since, a run the watchdog closed) are measured after the page is sent.
  afterCapturesShown(run.id, records.flatMap((r) => r.checkpoints.flatMap((c) => c.captures)));
  const byTest = await casesOfTests(access.project.id, records.map((r) => r.testId));
  const flows = toFlowViews(records, (resultId) => hrefs.result(run.number, resultId), { byTest, href: caseHref(hrefs) });
  const commit = [run.gitBranch, run.gitShortSha].filter(Boolean).join(' @ ');
  // The run's line of work: its pull request, else its branch — what the library keeps and pins.
  const key: LibraryRefKey | null = run.prNumber ? { kind: 'pull_request', prNumber: run.prNumber } : run.gitBranch ? { kind: 'branch', branch: run.gitBranch } : null;
  const reference = key ? await getLibraryReference(access.project.id, key, await defaultBranch(access.project.id, access.project.settings)) : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={hrefs.run(run.number)}>Run #{run.number}</BackLink>
        <PageHeader
          title={`Visual review · Run #${run.number}`}
          description={
            <>
              Every review checkpoint of the run, in the order each test captured it.{commit ? <> Commit <span className="text-code-s">{commit}</span>.</> : null} Open a checkpoint
              for the full image and the comparison with its approved baseline; <kbd>A</kbd> approves and moves on.
            </>
          }
        >
          {reference ? (
            <ConnectedRunLibraryActions team={team} project={access.project.slug} base={base} reference={reference} runNumber={run.number} canManage={access.can({ review: ['decide'] })} />
          ) : null}
        </PageHeader>
        {key ? (
          <p className="-mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-s text-muted-foreground">
            {run.prNumber ? (
              <PrefetchLink href={hrefs.pullRequest(run.prNumber)} className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline">
                <GitPullRequest className="size-3.5" /> Pull request #{run.prNumber}
              </PrefetchLink>
            ) : null}
            {run.gitBranch ? (
              <PrefetchLink href={hrefs.branch(run.gitBranch)} className="inline-flex items-center gap-1.5 text-code-s hover:text-foreground hover:underline">
                <GitBranch className="size-3.5" /> {run.gitBranch}
              </PrefetchLink>
            ) : null}
          </p>
        ) : null}
      </div>
      <UrlReviewStoryboard team={team} project={access.project.slug} flows={flows} canDecide={access.can({ review: ['decide'] })} />
    </div>
  );
}
