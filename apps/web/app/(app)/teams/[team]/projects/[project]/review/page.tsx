import { Suspense } from 'react';
import { BookImage } from 'lucide-react';
import { Button } from '@miguelfranken/ui/components/button';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { libraryRefParam, type LibraryRefKey } from '@miguelfranken/ui/lib/library';
import { ReviewQueue } from '@miguelfranken/ui/views/review/review-queue';
import { PrefetchLink } from '@/components/prefetch-link';
import { requireProject } from '@/lib/auth/access';
import { defaultBranch, listLibraryReferences, renderedAt, reviewQueue } from '@/lib/page-data';
import { projectHrefs } from '@/lib/view-models';

type Props = { params: Promise<{ team: string; project: string }> };

/**
 * Visual review: the changes whose screens wait for a decision, one row per
 * pull request or branch. Browsing the screens as documentation is the
 * library's job; this page is the to-do list.
 */
export default function ReviewQueuePage({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Visual review"
        description="Pull requests and branches whose newest run captured screens nobody approved yet. An image that matches an approved one needs nobody."
      >
        <Suspense fallback={null}>
          <LibraryLink params={params} />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<TableRowsSkeleton rows={8} columns={[30, 36, 24, 8]} className="panel" />}>
        <Queue params={params} />
      </Suspense>
    </>
  );
}

async function LibraryLink({ params }: Props) {
  const { team, project } = await params;
  return (
    <Button variant="outline" nativeButton={false} render={<PrefetchLink href={`/teams/${team}/projects/${project}/library`} />}>
      <BookImage /> Browse the library
    </Button>
  );
}

async function Queue({ params }: Props) {
  const { team, project: projectSlug } = await params;
  const { project } = await requireProject(team, projectSlug);
  const hrefs = projectHrefs(`/teams/${team}/projects/${project.slug}`);
  const branch = await defaultBranch(project.id, project.settings);
  const [rows, references, now] = await Promise.all([reviewQueue(project.id), listLibraryReferences(project.id, branch), renderedAt()]);
  return (
    <ReviewQueue
      rows={rows.map(({ runId: _runId, startedAt, ...r }) => {
        const key: LibraryRefKey | null = r.prNumber ? { kind: 'pull_request', prNumber: r.prNumber } : r.branch ? { kind: 'branch', branch: r.branch } : null;
        return {
          ...r,
          startedAt: new Date(startedAt).toISOString(),
          reviewHref: hrefs.runReview(r.number),
          changeHref: key ? hrefs.change(key) : null,
          libraryHref: key ? hrefs.library(key) : null,
        };
      })}
      libraryRefs={references.filter((r) => r.kept || r.isDefault).map((r) => libraryRefParam(r.key))}
      defaultBranch={branch}
      now={now}
    />
  );
}
