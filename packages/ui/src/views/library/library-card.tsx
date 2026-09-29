'use client';

import { BookImage, Diff, Images, Pin, Plus, Settings2, Star } from 'lucide-react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/card';
import { ReviewStatusBadge } from '../../patterns/review-status-badge';
import { Link } from '../../provider';
import { formatDateTime, formatRelative } from '../../lib/format';
import { libraryRefShort, type LibraryReferenceView } from '../../lib/library';

/**
 * A branch's or pull request's screens, from its own page: what its newest
 * run asks of a reviewer, and whether it is kept in the library — so a
 * long-lived pull request can be kept as documentation while it is open, and
 * a stable branch made the library's default, without leaving the page.
 */
export function LibraryCard({
  reference,
  reviewHref,
  libraryHref,
  onKeep,
  onSettings,
  pending = false,
  now,
}: {
  reference: LibraryReferenceView;
  /** The newest run's review. */
  reviewHref: string | null;
  /** The library on this reference. */
  libraryHref: string;
  /** Keeps it in the library; absent for readers who may not change it. */
  onKeep?: () => void;
  onSettings?: () => void;
  pending?: boolean;
  now?: Date;
}) {
  const run = reference.latestRun;
  const counts = reference.latestCounts;
  const waiting = counts ? counts.changed + counts.new : 0;
  const what = reference.key.kind === 'branch' ? 'branch' : 'pull request';
  const inLibrary = reference.kept || reference.isDefault;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-5">
        <CardTitle className="flex items-center gap-2">
          <Images className="size-4 text-muted-foreground" />
          Screens
        </CardTitle>
        <CardDescription>What the review checkpoints of this {what} captured.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 py-5 md:grid-cols-2 md:gap-0 md:divide-x md:divide-separator">
        <section aria-label="Visual review" className="flex flex-col gap-3 md:pr-6">
          <h3 className="text-label-m text-muted-foreground">Visual review</h3>
          {run ? (
            <>
              <p className="text-body-m">
                Newest run <span className="font-medium tabular-nums">#{run.number}</span>
                <span className="text-muted-foreground" title={formatDateTime(run.startedAt)}>
                  {' '}
                  · {formatRelative(run.startedAt, now ? { now } : undefined)}
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {waiting === 0 && !counts?.changes_requested ? <span className="text-body-s text-muted-foreground">Nothing waits for review.</span> : null}
                {counts?.changed ? <ReviewStatusBadge status="changed" label={`${counts.changed} changed`} /> : null}
                {counts?.new ? <ReviewStatusBadge status="new" label={`${counts.new} new`} /> : null}
                {counts?.changes_requested ? <ReviewStatusBadge status="changes_requested" label={`${counts.changes_requested} changes requested`} /> : null}
              </div>
              {reviewHref ? (
                <Button variant={waiting ? 'default' : 'outline'} size="sm" className="self-start" nativeButton={false} render={<Link href={reviewHref} />}>
                  <Diff /> {waiting ? 'Review changes' : 'Open the review'}
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-body-s text-muted-foreground">No run of this {what} captured review checkpoints yet.</p>
          )}
        </section>

        <section aria-label="Library" className="flex flex-col gap-3 md:pl-6">
          <h3 className="flex items-center gap-2 text-label-m text-muted-foreground">
            Library
            {reference.isDefault ? (
              <Badge variant="secondary" className="gap-1">
                <Star className="size-3" /> Default
              </Badge>
            ) : null}
          </h3>
          <p className="text-body-m text-pretty">
            {inLibrary ? (
              reference.pinnedRun ? (
                <>
                  <Pin aria-hidden className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" />
                  Kept, pinned to run <span className="font-medium tabular-nums">#{reference.pinnedRun.number}</span>.
                </>
              ) : (
                <>Kept, showing the newest screens of {libraryRefShort(reference.key)}.</>
              )
            ) : (
              <>Not in the library. Keep it to let anyone browse its screens and flows{reference.key.kind === 'pull_request' ? ' while it is open' : ''}.</>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {!inLibrary && onKeep ? (
              <Button variant="outline" size="sm" disabled={pending || !run} onClick={onKeep}>
                <Plus /> {pending ? 'Keeping…' : 'Keep in library'}
              </Button>
            ) : null}
            {run ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={libraryHref} />}>
                <BookImage /> {inLibrary ? 'Open in library' : 'Browse its screens'}
              </Button>
            ) : null}
            {onSettings ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={onSettings}>
                <Settings2 /> Library settings
              </Button>
            ) : null}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
