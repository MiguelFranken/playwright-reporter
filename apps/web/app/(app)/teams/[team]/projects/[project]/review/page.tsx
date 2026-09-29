import { Suspense } from 'react';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { ReviewQueue } from '@miguelfranken/ui/views/review/review-queue';
import { requireProject } from '@/lib/auth/access';
import { renderedAt, reviewQueue } from '@/lib/page-data';
import { ReviewTabs } from '@/components/review/review-tabs';

type Props = { params: Promise<{ team: string; project: string }> };

export default function ReviewQueuePage({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Visual review"
        description="Runs with review checkpoints, newest first. An image that matches an approved one needs nobody; changed and new ones wait here."
      />
      {/* The tabs read the URL; outside a boundary that would hold up the prerender. */}
      <Suspense fallback={<div className="h-10 border-b border-separator" />}>
        <ReviewTabs />
      </Suspense>
      <Suspense fallback={<TableRowsSkeleton rows={8} columns={[12, 36, 12, 24, 8, 8]} className="panel" />}>
        <Queue params={params} />
      </Suspense>
    </>
  );
}

async function Queue({ params }: Props) {
  const { team, project: projectSlug } = await params;
  const { project } = await requireProject(team, projectSlug);
  const base = `/teams/${team}/projects/${project.slug}`;
  const [rows, now] = await Promise.all([reviewQueue(project.id), renderedAt()]);
  return (
    <ReviewQueue
      rows={rows.map(({ runId: _runId, startedAt, ...r }) => ({ ...r, startedAt: new Date(startedAt).toISOString() }))}
      runHref={(n) => `${base}/runs/${n}/review`}
      now={now}
    />
  );
}
