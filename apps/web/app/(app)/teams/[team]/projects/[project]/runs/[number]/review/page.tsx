import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { BackLink } from '@miguelfranken/ui/patterns/back-link';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ReviewStoryboardSkeleton } from '@miguelfranken/ui/views/review/review-skeleton';
import { UrlReviewStoryboard } from '@/components/review/url-review-storyboard';
import { requireProject } from '@/lib/auth/access';
import { casesOfTests, getRunByNumber, runReview } from '@/lib/page-data';
import { toFlowViews } from '@/lib/review/view-model';
import { projectHrefs } from '@/lib/view-models';
import { caseHref } from '@/lib/review/view-model';

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
  const byTest = await casesOfTests(access.project.id, records.map((r) => r.testId));
  const flows = toFlowViews(records, (resultId) => hrefs.result(run.number, resultId), { byTest, href: caseHref(hrefs) });
  const commit = [run.gitBranch, run.gitShortSha].filter(Boolean).join(' @ ');
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
        />
      </div>
      <UrlReviewStoryboard team={team} project={access.project.slug} flows={flows} canDecide={access.can({ review: ['decide'] })} />
    </div>
  );
}
