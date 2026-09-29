'use client';

import { ArrowLeftRight, Check, ChevronDown, Diff, GitBranch, GitPullRequest, Pin, Plus, Settings2, Star, X } from 'lucide-react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/dropdown-menu';
import { Link } from '../../provider';
import { cn } from '../../lib/cn';
import { formatDateTime, formatRelative } from '../../lib/format';
import { libraryRefLabel, libraryRefShort, sameLibraryRef, shownRun, type LibraryReferenceView, type LibraryRefKey, type LibraryRunView } from '../../lib/library';

export const RefIcon = ({ refKey, className }: { refKey: LibraryRefKey; className?: string }) =>
  refKey.kind === 'branch' ? <GitBranch aria-hidden className={cn('size-4 shrink-0', className)} /> : <GitPullRequest aria-hidden className={cn('size-4 shrink-0', className)} />;

/** "Newest run #55 · 47 minutes ago", "Pinned to run #52 · 3 days ago", or that nothing was captured yet. */
export function sourceSummary(ref: Pick<LibraryReferenceView, 'pinnedRun' | 'latestRun'>, now?: Date): string {
  const run = shownRun(ref);
  if (!run) return 'No run with review checkpoints yet';
  const when = formatRelative(run.startedAt, now ? { now } : undefined);
  return ref.pinnedRun ? `Pinned to run #${run.number} · ${when}` : `Newest run #${run.number} · ${when}`;
}

/**
 * Which branch or pull request the library shows, and which version of it:
 * a picker over every reference (the default first, then branches, then
 * pull requests), what run is on screen and whether it is pinned, and — for
 * the developer who came to check their work — how many of its images still
 * wait for review.
 */
export function LibraryReferenceBar({
  references,
  current,
  onReferenceChange,
  reviewHref,
  runHref,
  onSettings,
  onKeep,
  pending = false,
  now,
  compareWith,
  onCompareChange,
}: {
  references: readonly LibraryReferenceView[];
  current: LibraryReferenceView;
  onReferenceChange: (key: LibraryRefKey) => void;
  /** The shown run's review, when it has images waiting. */
  reviewHref?: string | null;
  runHref: (number: number) => string;
  /** Opens the reference's settings; absent for readers who may not change the library. */
  onSettings?: () => void;
  /** Keeps a reference the library does not list yet (one opened from its pull request). */
  onKeep?: () => void;
  pending?: boolean;
  now?: Date;
  /** The reference every screen is compared with, when the library compares two. */
  compareWith?: LibraryReferenceView | null;
  /** Picks the reference to compare with, or `null` to stop; without it the library does not compare. */
  onCompareChange?: (key: LibraryRefKey | null) => void;
}) {
  const run = shownRun(current);
  const listed = current.kept || current.isDefault;
  const waiting = current.latestCounts ? current.latestCounts.changed + current.latestCounts.new : 0;
  const branches = references.filter((r) => r.key.kind === 'branch');
  const pulls = references.filter((r) => r.key.kind === 'pull_request');
  const label = libraryRefLabel(current);

  return (
    <section aria-label="Library version" className="flex flex-col gap-3 border-b border-separator pb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="h-10 max-w-full gap-2 px-3" aria-label={`Showing ${label}. Choose a branch or pull request`} />}>
            <RefIcon refKey={current.key} className="text-muted-foreground" />
            <span className="truncate text-title-s">{label}</span>
            {current.title ? <span className="hidden truncate text-code-s text-muted-foreground sm:inline">{libraryRefShort(current.key)}</span> : null}
            <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-88 max-w-[calc(100vw-2rem)]">
            <RefGroup label="Branches" refs={branches} current={current} onPick={onReferenceChange} now={now} />
            {pulls.length ? (
              <>
                <DropdownMenuSeparator />
                <RefGroup label="Pull requests" refs={pulls} current={current} onPick={onReferenceChange} now={now} />
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-body-s text-muted-foreground">
          {current.isDefault ? (
            <Badge variant="secondary" className="gap-1">
              <Star className="size-3" /> Default
            </Badge>
          ) : null}
          {current.pinnedRun ? <Pin aria-hidden className="size-3.5" /> : null}
          {run ? (
            <span title={run.commitMessage ?? undefined}>
              {current.pinnedRun ? 'Pinned to ' : 'Newest run '}
              <Link href={runHref(run.number)} className="font-medium text-foreground tabular-nums hover:underline">
                #{run.number}
              </Link>
              <span title={formatDateTime(run.startedAt)}> · {formatRelative(run.startedAt, now ? { now } : undefined)}</span>
              {run.commit ? <span className="text-code-s"> · {run.commit}</span> : null}
            </span>
          ) : (
            <span>No run with review checkpoints yet</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {onCompareChange ? <CompareMenu references={references} current={current} compareWith={compareWith ?? null} onChange={onCompareChange} now={now} /> : null}
          {!listed ? <span className="text-body-s text-muted-foreground">Not kept in the library</span> : null}
          {!listed && onKeep ? (
            <Button variant="outline" size="sm" disabled={pending || !run} onClick={onKeep}>
              <Plus /> {pending ? 'Keeping…' : 'Keep in library'}
            </Button>
          ) : null}
          {reviewHref && waiting ? (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={reviewHref} />}>
              <Diff /> Review {waiting} {waiting === 1 ? 'change' : 'changes'}
            </Button>
          ) : null}
          {onSettings && listed ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={onSettings}>
              <Settings2 /> Settings
            </Button>
          ) : null}
        </div>
      </div>
      {compareWith ? (
        <p className="flex items-center gap-1.5 text-body-s text-muted-foreground">
          <ArrowLeftRight aria-hidden className="size-3.5" /> Every screen is compared with <span className="font-medium text-foreground">{libraryRefLabel(compareWith)}</span>; open one to see what differs.
        </p>
      ) : null}
      {current.description ? <p className="max-w-prose text-body-m text-pretty text-muted-foreground">{current.description}</p> : null}
      {run?.commitMessage && !current.description ? <p className="max-w-prose truncate text-body-s text-muted-foreground">{run.commitMessage}</p> : null}
    </section>
  );
}

/** "Compare with…": another reference to measure every screen against, or stop comparing. */
function CompareMenu({
  references,
  current,
  compareWith,
  onChange,
  now,
}: {
  references: readonly LibraryReferenceView[];
  current: LibraryReferenceView;
  compareWith: LibraryReferenceView | null;
  onChange: (key: LibraryRefKey | null) => void;
  now?: Date;
}) {
  const others = references.filter((r) => !sameLibraryRef(r.key, current.key));
  if (!others.length && !compareWith) return null;
  const branches = others.filter((r) => r.key.kind === 'branch');
  const pulls = others.filter((r) => r.key.kind === 'pull_request');
  const shown = compareWith ?? current;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant={compareWith ? 'secondary' : 'outline'} size="sm" className="max-w-64" />}>
        <ArrowLeftRight /> <span className="truncate">{compareWith ? `Compared with ${libraryRefLabel(compareWith)}` : 'Compare with…'}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-88 max-w-[calc(100vw-2rem)]">
        {compareWith ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => onChange(null)} className="gap-2">
                <X aria-hidden className="size-4 text-muted-foreground" /> Stop comparing
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {branches.length ? <RefGroup label="Compare with a branch" refs={branches} current={shown} onPick={onChange} now={now} /> : null}
        {branches.length && pulls.length ? <DropdownMenuSeparator /> : null}
        {pulls.length ? <RefGroup label="Compare with a pull request" refs={pulls} current={shown} onPick={onChange} now={now} /> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RefGroup({
  label,
  refs,
  current,
  onPick,
  now,
}: {
  label: string;
  refs: readonly LibraryReferenceView[];
  current: LibraryReferenceView;
  onPick: (key: LibraryRefKey) => void;
  now?: Date;
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {refs.map((r) => {
        const active = sameLibraryRef(r.key, current.key);
        return (
          <DropdownMenuItem key={libraryRefShort(r.key)} onClick={() => onPick(r.key)} className="items-start gap-2 py-2">
            <RefIcon refKey={r.key} className="mt-0.5 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium">{libraryRefLabel(r)}</span>
                {r.isDefault ? (
                  <>
                    <Star aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                    <span className="sr-only">(default)</span>
                  </>
                ) : null}
              </span>
              <span className="truncate text-body-s text-muted-foreground">
                {r.title ? `${libraryRefShort(r.key)} · ` : ''}
                {sourceSummary(r, now)}
              </span>
            </span>
            {active ? (
              <>
                <Check aria-hidden className="mt-0.5 size-4" />
                <span className="sr-only">(shown)</span>
              </>
            ) : null}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
}

export type { LibraryRunView };
