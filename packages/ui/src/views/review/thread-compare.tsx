'use client';

import { Check, History, X } from 'lucide-react';
import { Button } from '../../components/button';
import { CommentPin } from '../../patterns/comment-pin';
import { ProfileAvatar } from '../../patterns/profile-avatar';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import type { FrameSize, ReviewImage } from '../../lib/review';
import { openingComment, type FractionAnchor, type ReviewThreadView } from '../../lib/review-threads';
import { ScreenFrame } from './screen-frame';

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

/** The pin as it was placed on the version commented on: not interactive, the conversation is beside it. */
function OriginMarker({ number, anchor }: { number: number; anchor: FractionAnchor }) {
  if (anchor.kind === 'image') return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {anchor.kind === 'area' && anchor.w != null && anchor.h != null ? (
        <div className="absolute rounded-sm border-2 border-accent-solid bg-accent-solid/10" style={{ left: pct(anchor.x), top: pct(anchor.y), width: pct(anchor.w), height: pct(anchor.h) }} />
      ) : null}
      <div className="absolute -translate-y-full" style={{ left: pct(anchor.x), top: pct(anchor.y) }}>
        <CommentPin number={number} state="open" tabIndex={-1} className="pointer-events-none" />
      </div>
    </div>
  );
}

/**
 * An open comment made on an earlier version of a screen, next to the screen
 * as it is now: the version commented on with the pin where it was placed
 * and the comment itself, beside the latest capture with the pin carried
 * over. What a reviewer needs to tell whether the change asked for was made
 * — and nothing is resolved until they say so.
 */
export function ThreadCompare({
  thread,
  image,
  frame,
  zoom,
  label,
  currentLabel = 'Now',
  now,
  currentOverlay,
  canResolve = false,
  onResolve,
  onClose,
}: {
  thread: ReviewThreadView;
  /** The screen as it is now. */
  image: ReviewImage;
  frame: FrameSize;
  zoom: number;
  label: string;
  currentLabel?: string;
  now?: Date;
  /** The live pins on the current screen (the viewer's pin layer). */
  currentOverlay?: React.ReactNode;
  canResolve?: boolean;
  onResolve?: () => void;
  onClose: () => void;
}) {
  const origin = thread.origin;
  const first = openingComment(thread);
  const resolved = thread.status === 'resolved';
  return (
    <div className="flex min-w-max flex-col items-center gap-4" role="group" aria-label={`Comment ${thread.number}: the version commented on and the screen now`}>
      <div className="flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-info-border bg-info-subtle px-3 py-2 text-label-s text-info-text">
        <History aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {resolved
            ? `Comment #${thread.number} is resolved.`
            : `Comment #${thread.number} was made on ${thread.originRunNumber ? `run #${thread.originRunNumber}` : 'an earlier version'}; the screen has changed since. Compare them, then resolve it or reply.`}
        </span>
        {canResolve && onResolve && !resolved ? (
          <Button size="xs" onClick={onResolve}>
            <Check /> Resolve
          </Button>
        ) : null}
        <Button size="xs" variant="ghost" onClick={onClose}>
          <X /> Close comparison
        </Button>
      </div>
      <div className="flex items-start justify-center gap-6">
        <figure className="flex flex-col gap-1.5">
          <figcaption className="flex items-center gap-1.5 text-label-s text-muted-foreground">
            <History aria-hidden className="size-3.5" />
            Commented on{thread.originRunNumber ? ` · run #${thread.originRunNumber}` : ''}
          </figcaption>
          {origin ? (
            <ScreenFrame image={origin.image} frame={frame} zoom={zoom} alt={`${label} — the version commented on`} eager overlay={() => <OriginMarker number={thread.number} anchor={origin.anchor} />} />
          ) : (
            <div className="flex items-center justify-center rounded-md bg-surface-sunken p-6 text-center text-label-s text-muted-foreground ring-1 ring-border" style={{ width: frame.width * zoom, height: frame.height * zoom }}>
              The image this comment was made on is no longer stored.
            </div>
          )}
          {first ? (
            <blockquote className={cn('flex max-w-sm gap-2 rounded-lg border border-border bg-surface p-2.5 text-sm shadow-e1')} style={{ width: Math.min(384, frame.width * zoom) }}>
              <ProfileAvatar name={first.author?.name ?? 'AI assistant'} image={first.author?.image} size="sm" className="mt-0.5 size-5" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-label-xs text-muted-foreground">
                  <span className="truncate text-label-s text-foreground">{first.author?.name ?? 'AI assistant'}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{formatRelative(first.at, { now })}</span>
                </span>
                <span className="mt-0.5 block text-pretty break-words whitespace-pre-wrap">{first.body}</span>
              </span>
            </blockquote>
          ) : null}
        </figure>
        <figure className="flex flex-col gap-1.5">
          <figcaption className="text-label-s text-muted-foreground">{currentLabel}</figcaption>
          <ScreenFrame image={image} frame={frame} zoom={zoom} alt={`${label} — now`} eager overlay={currentOverlay ? () => currentOverlay : undefined} />
        </figure>
      </div>
    </div>
  );
}
