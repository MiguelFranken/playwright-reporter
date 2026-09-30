'use client';

import { Check, Columns2, History, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/tooltip';
import { cn } from '../../lib/cn';
import type { ReviewThreadView, ThreadActions } from '../../lib/review-threads';
import { CommentComposer } from '../../patterns/comment-composer';
import { CommentItem } from '../../patterns/comment-item';

export interface ThreadViewProps extends ThreadActions {
  thread: ReviewThreadView;
  /** The capture it is shown with: resolving records it, so the thread stays visible there. */
  captureId?: string | null;
  now?: Date;
  /** The signed-in user: their own comments can be edited and deleted. */
  viewerId?: string | null;
  canComment?: boolean;
  /** May delete anybody's comment. */
  canModerate?: boolean;
  /** Shows a close button (in a popover). */
  onClose?: () => void;
  /** Focus the reply box when it mounts. */
  autoFocusReply?: boolean;
  /** Shown on the image it was placed on (beside the screen now), not on the screen now. */
  onOrigin?: boolean;
  /** Tools beside resolve (an AI hand-off menu). */
  actions?: React.ReactNode;
  /** Off where the view around it already says the screen changed since (verifying). */
  showPlacement?: boolean;
  className?: string;
}

/**
 * A whole thread: its number, status and where it was placed, every comment
 * with the resolve and reopen events between them, and a reply box. The same
 * view shows in a pin's popover and, for a thread without a pin, in the list.
 */
export function ThreadView({
  thread,
  captureId,
  now,
  viewerId,
  canComment = false,
  canModerate = false,
  onClose,
  autoFocusReply = false,
  onOrigin = false,
  actions,
  showPlacement = true,
  onReply,
  onSetThreadStatus,
  onEditComment,
  onDeleteComment,
  onCompareThread,
  className,
}: ThreadViewProps) {
  const resolved = thread.status === 'resolved';
  const listRef = useRef<HTMLOListElement>(null);
  const count = thread.comments.length;
  // A new comment (a reply just posted, an event) scrolls into view at the bottom.
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    seen.current = count;
  }, [count]);
  const toggle = () => onSetThreadStatus?.({ threadId: thread.id, status: resolved ? 'open' : 'resolved', captureId });
  const toggleLabel = resolved ? `Reopen thread ${thread.number}` : `Resolve thread ${thread.number}`;
  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label={`Thread ${thread.number}`}>
      <header className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center rounded-full rounded-bl-[3px] px-1 text-label-xs tabular-nums',
            resolved ? 'bg-muted text-muted-foreground' : 'bg-accent-solid text-accent-on-solid',
          )}
        >
          {thread.number}
        </span>
        <span className="text-label-s">{resolved ? 'Resolved' : 'Open'}</span>
        {thread.anchor.kind === 'image' ? <span className="text-label-xs text-muted-foreground">· whole image</span> : null}
        <div className="ml-auto flex items-center gap-0.5">
          {actions}
          {canComment && onSetThreadStatus && !thread.pending ? (
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={toggleLabel} onClick={toggle} />}>{resolved ? <RotateCcw /> : <Check />}</TooltipTrigger>
              <TooltipContent>{resolved ? 'Reopen' : 'Resolve'}</TooltipContent>
            </Tooltip>
          ) : null}
          {onClose ? (
            <Button variant="ghost" size="icon-sm" aria-label="Close thread" onClick={onClose}>
              <X />
            </Button>
          ) : null}
        </div>
      </header>

      {thread.placement === 'outdated' && showPlacement ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-info-border bg-info-subtle px-2 py-1.5 text-label-xs text-info-text">
          <p className="flex items-start gap-1.5">
            <History aria-hidden className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              {onOrigin
                ? `Placed here, on ${thread.originRunNumber ? `run #${thread.originRunNumber}` : 'this version'}. The screen has changed since: check whether it was fixed.`
                : `Placed on ${thread.originRunNumber ? `run #${thread.originRunNumber}` : 'an earlier version'}; the screen has changed since, so check whether it was fixed.`}
            </span>
          </p>
          {thread.origin && onCompareThread && !resolved ? (
            <Button size="xs" variant="outline" className="self-start bg-surface" onClick={() => onCompareThread(thread.id)}>
              <Columns2 /> Verify the fix
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* A long conversation scrolls: focusable, so the keyboard can scroll it too. */}
      <ol
        ref={listRef}
        tabIndex={0}
        aria-label={`Comments of thread ${thread.number}`}
        className="-m-1 flex max-h-80 flex-col gap-3 overflow-y-auto overscroll-contain rounded-md p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {thread.comments.map((c) => (
          <li key={c.id}>
            <CommentItem
              comment={c}
              now={now}
              canEdit={canComment && Boolean(viewerId) && c.authorId === viewerId}
              canDelete={canComment && (canModerate || (Boolean(viewerId) && c.authorId === viewerId))}
              onEdit={onEditComment ? (body) => onEditComment({ commentId: c.id, body }) : undefined}
              onDelete={onDeleteComment ? () => onDeleteComment({ commentId: c.id, threadId: thread.id }) : undefined}
            />
          </li>
        ))}
      </ol>

      {canComment && onReply && !thread.pending ? (
        <CommentComposer
          compact
          label={`Reply to thread ${thread.number}`}
          placeholder={resolved ? 'Reply (the thread stays resolved)…' : 'Reply…'}
          submitLabel="Reply"
          autoFocus={autoFocusReply}
          onSubmit={(body) => onReply({ threadId: thread.id, body })}
        />
      ) : null}
    </section>
  );
}
