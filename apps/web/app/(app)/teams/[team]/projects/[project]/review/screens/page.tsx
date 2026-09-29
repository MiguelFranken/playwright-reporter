import { Suspense } from 'react';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ReviewStoryboardSkeleton } from '@miguelfranken/ui/views/review/review-skeleton';
import { UrlReviewStoryboard } from '@/components/review/url-review-storyboard';
import { requireProject } from '@/lib/auth/access';
import { defaultBranch, screenCatalogue } from '@/lib/page-data';
import { screensToFlows } from '@/lib/review/view-model';
import { projectHrefs } from '@/lib/view-models';
import { ReviewTabs } from '@/components/review/review-tabs';

type Props = { params: Promise<{ team: string; project: string }> };

/**
 * The product as its suite sees it: every checkpoint's approved image — or,
 * where nobody approved one yet, the newest from the default branch — in the
 * order each journey takes. Living visual documentation of every flow.
 */
export default function ScreensPage({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Visual review"
        description="Every flow's screens as last approved; a screen nobody approved yet shows the default branch's newest capture and is marked New."
      />
      <ReviewTabs />
      <Suspense fallback={<ReviewStoryboardSkeleton />}>
        <Screens params={params} />
      </Suspense>
    </>
  );
}

async function Screens({ params }: Props) {
  const { team, project: projectSlug } = await params;
  const { project } = await requireProject(team, projectSlug);
  const hrefs = projectHrefs(`/teams/${team}/projects/${project.slug}`);
  const branch = await defaultBranch(project.id, project.settings);
  const flows = screensToFlows(await screenCatalogue(project.id, branch), hrefs.test);
  return <UrlReviewStoryboard team={team} project={project.slug} flows={flows} canDecide={false} defaultFilter="all" emptyTitle="No screens yet" />;
}
