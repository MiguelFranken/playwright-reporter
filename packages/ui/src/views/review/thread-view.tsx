'use client';

import { Check, History, RotateCcw, X } from 'lucide-react';
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

      {thread.placement === 'outdated' ? (
        <p className="flex items-start gap-1.5 rounded-md bg-surface-sunken px-2 py-1.5 text-label-xs text-muted-foreground">
          <History aria-hidden className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            Placed on {thread.originRunNumber ? `run #${thread.originRunNumber}` : 'an earlier image'}; the image changed since, so the pin may be off.
            {thread.origin && onCompareThread ? (
              <>
                {' '}
                <button type="button" className="text-accent-text underline-offset-2 hover:underline focus-visible:underline" onClick={() => onCompareThread(thread.id)}>
                  Compare with the version commented on
                </button>
              </>
            ) : null}
          </span>
        </p>
      ) : null}

      <ol ref={listRef} className="flex max-h-80 flex-col gap-3 overflow-y-auto overscroll-contain">
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
