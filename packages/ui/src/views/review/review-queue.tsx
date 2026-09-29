'use client';

import { BookImage, Check, GitBranch, GitPullRequest, Images, Star } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { EmptyState } from '../../patterns/empty-state';
import { ReviewStatusBadge } from '../../patterns/review-status-badge';
import { StatusBadge } from '../../patterns/status-badge';
import { Link } from '../../provider';
import { formatDateTime, formatRelative } from '../../lib/format';
import { libraryRefParam, type LibraryRefKey } from '../../lib/library';
import type { ReviewCounts } from '../../lib/review';

export interface ReviewQueueRow {
  number: number;
  status: string;
  branch: string | null;
  commit: string | null;
  commitMessage: string | null;
  prNumber: number | null;
  /** The pull request's title, when its runs sent one. */
  prTitle?: string | null;
  startedAt: string;
  counts: ReviewCounts;
  /** The run's review page. */
  reviewHref: string;
  /** The pull request's (or branch's) page. */
  changeHref?: string | null;
  /** The library on that pull request or branch. */
  libraryHref?: string | null;
}

/** A pull request or branch in the queue: its newest run, and how many runs it superseded. */
export interface ReviewChange {
  key: LibraryRefKey | null;
  latest: ReviewQueueRow;
  earlier: number;
}

/** Runs, newest first, as one row per pull request (or branch, for runs outside one): only the newest run of a change needs a reviewer. */
export function groupReviewQueue(rows: readonly ReviewQueueRow[]): ReviewChange[] {
  const out: ReviewChange[] = [];
  const byKey = new Map<string, ReviewChange>();
  for (const row of rows) {
    const key: LibraryRefKey | null = row.prNumber ? { kind: 'pull_request', prNumber: row.prNumber } : row.branch ? { kind: 'branch', branch: row.branch } : null;
    const id = key ? libraryRefParam(key) : `run:${row.number}`;
    const existing = byKey.get(id);
    if (existing) existing.earlier++;
    else {
      const change = { key, latest: row, earlier: 0 };
      byKey.set(id, change);
      out.push(change);
    }
  }
  return out;
}

const needsOf = (c: ReviewCounts) => c.changed + c.new;

/**
 * What waits for a reviewer, one row per pull request or branch: its newest
 * run's changed and new images — earlier runs of the same change are
 * superseded and only counted — where the change lives, and whether it is
 * kept in the library. Opens on the changes that need someone; everything
 * else is one click away.
 */
export function ReviewQueue({
  rows,
  libraryRefs = [],
  defaultBranch,
  now,
}: {
  rows: readonly ReviewQueueRow[];
  /** References kept in the library, as `libraryRefParam` writes them. */
  libraryRefs?: readonly string[];
  defaultBranch?: string | null;
  now?: Date;
}) {
  const changes = groupReviewQueue(rows);
  const waiting = changes.filter((c) => needsOf(c.latest.counts) > 0 || c.latest.counts.changes_requested > 0);
  const [show, setShow] = useState<'waiting' | 'all'>(waiting.length ? 'waiting' : 'all');
  const kept = new Set(libraryRefs);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title="No runs with review checkpoints yet"
        description={
          <>
            Capture checkpoints with <code className="text-code-s">review(&apos;name&apos;)</code> from <code className="text-code-s">@miguelfranken/reporter/review</code> and they appear here after the next run.
          </>
        }
      />
    );
  }
  const shown = show === 'waiting' ? waiting : changes;

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup variant="segment" size="sm" value={[show]} onValueChange={(v) => v[0] && setShow(v[0] as 'waiting' | 'all')} aria-label="Show" className="self-start">
        <ToggleGroupItem value="waiting">
          Waiting for review <span className="text-muted-foreground tabular-nums">{waiting.length}</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="all">
          All changes <span className="text-muted-foreground tabular-nums">{changes.length}</span>
        </ToggleGroupItem>
      </ToggleGroup>
      {shown.length === 0 ? (
        <EmptyState icon={Check} title="Nothing waits for review" description="The newest run of every pull request and branch matches what was approved, or was decided about.">
          <Button variant="outline" size="sm" onClick={() => setShow('all')}>
            Show all {changes.length} changes
          </Button>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Change</TableHead>
                <TableHead>Newest run</TableHead>
                <TableHead>Needs review</TableHead>
                <TableHead className="sr-only">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map(({ key, latest: r, earlier }) => {
                const needs = needsOf(r.counts);
                const isDefault = key?.kind === 'branch' && key.branch === defaultBranch;
                const inLibrary = key ? kept.has(libraryRefParam(key)) || isDefault : false;
                const name = key?.kind === 'pull_request' ? `#${key.prNumber}${r.prTitle ? ` ${r.prTitle}` : ''}` : (key?.branch ?? `Run #${r.number}`);
                return (
                  <TableRow key={key ? libraryRefParam(key) : r.number}>
                    <TableCell className="max-w-96">
                      <div className="flex min-w-0 items-center gap-2">
                        {key?.kind === 'pull_request' ? <GitPullRequest aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <GitBranch aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                        {key && r.changeHref ? (
                          <Link href={r.changeHref} className="truncate font-medium hover:underline" title={name}>
                            {name}
                          </Link>
                        ) : (
                          <span className="truncate font-medium">{name}</span>
                        )}
                        {isDefault ? (
                          <Badge variant="secondary" className="gap-1">
                            <Star className="size-3" /> Default
                          </Badge>
                        ) : null}
                        {inLibrary && r.libraryHref ? (
                          <Link href={r.libraryHref} className="inline-flex shrink-0 items-center gap-1 text-label-xs text-muted-foreground hover:text-foreground hover:underline" title="Kept in the library">
                            <BookImage className="size-3.5" /> Library
                          </Link>
                        ) : null}
                      </div>
                      {key?.kind === 'pull_request' && r.branch ? <p className="mt-0.5 truncate pl-6 text-code-s text-muted-foreground">{r.branch}</p> : null}
                    </TableCell>
                    <TableCell className="max-w-96">
                      <div className="flex items-center gap-2">
                        <Link href={r.reviewHref} className="font-medium tabular-nums hover:underline">
                          #{r.number}
                        </Link>
                        <StatusBadge status={r.status} />
                        <span className="text-body-s text-muted-foreground" title={formatDateTime(r.startedAt)}>
                          {formatRelative(r.startedAt, now ? { now } : undefined)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-body-s text-muted-foreground" title={r.commitMessage ?? undefined}>
                        {r.commit ? <span className="text-code-s">{r.commit} </span> : null}
                        {r.commitMessage ?? ''}
                        {earlier ? <span> · {earlier} earlier {earlier === 1 ? 'run' : 'runs'}</span> : null}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {needs === 0 && r.counts.changes_requested === 0 ? <span className="text-body-s text-muted-foreground">Nothing{r.counts.approved ? ` · ${r.counts.approved} approved` : ''}</span> : null}
                        {r.counts.changed ? <ReviewStatusBadge status="changed" label={`${r.counts.changed} changed`} /> : null}
                        {r.counts.new ? <ReviewStatusBadge status="new" label={`${r.counts.new} new`} /> : null}
                        {r.counts.changes_requested ? <ReviewStatusBadge status="changes_requested" label={`${r.counts.changes_requested} changes requested`} /> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant={needs ? 'default' : 'outline'} size="sm" nativeButton={false} render={<Link href={r.reviewHref} />}>
                        {needs ? 'Review' : 'View'}
                        <span className="sr-only"> run #{r.number}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
