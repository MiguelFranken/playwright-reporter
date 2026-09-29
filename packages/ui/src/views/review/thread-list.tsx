'use client';

import { Check, History, MessageSquare, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { SegmentedControl } from '../../components/segmented-control';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import {
  matchesThreadFilter,
  openingComment,
  replies,
  sortThreads,
  THREAD_FILTER_LABELS,
  THREAD_FILTERS,
  type ReviewThreadView,
  type ThreadActions,
  type ThreadFilter,
} from '../../lib/review-threads';
import { CommentComposer } from '../../patterns/comment-composer';
import { ProfileAvatar } from '../../patterns/profile-avatar';
import { ThreadView } from './thread-view';

/** The threads of one image the viewer shows. */
export interface ThreadGroup {
  captureId: string;
  variant: string;
  threads: readonly ReviewThreadView[];
}

export interface ThreadListProps extends ThreadActions {
  groups: readonly ThreadGroup[];
  filter: ThreadFilter;
  onFilterChange: (next: ThreadFilter) => void;
  /** The thread open in a pin's popover, or expanded here when it has no pin. */
  openThreadId?: string | null;
  onOpenThreadChange?: (threadId: string | null) => void;
  /** A row is hovered or focused: its pin pings. */
  onHighlight?: (threadId: string | null) => void;
  /** Comment mode is on (the button reads "Commenting"). */
  commenting?: boolean;
  onCommentingChange?: (next: boolean) => void;
  /** The whole-image composer is open. */
  composing?: boolean;
  onComposingChange?: (next: boolean) => void;
  now?: Date;
  viewerId?: string | null;
  canComment?: boolean;
  canModerate?: boolean;
  className?: string;
}

/**
 * Every thread of the images on screen, as a list: open ones first, by
 * number, each with who started it, a preview, its replies, and whether it
 * was placed on an earlier image. A row points at its pin (which pings on
 * hover and opens on click); a thread about the whole image opens here.
 * Above the list: comment mode, a comment on the whole image, and the
 * open / resolved / all filter.
 */
export function ThreadList({
  groups,
  filter,
  onFilterChange,
  openThreadId = null,
  onOpenThreadChange,
  onHighlight,
  commenting = false,
  onCommentingChange,
  composing = false,
  onComposingChange,
  now,
  viewerId,
  canComment = false,
  canModerate = false,
  onCreateThread,
  onReply,
  onSetThreadStatus,
  onEditComment,
  onDeleteComment,
  className,
}: ThreadListProps) {
  const all = groups.flatMap((g) => g.threads);
  const open = all.filter((t) => t.status === 'open').length;
  const resolved = all.length - open;
  const several = groups.length > 1;
  const threadProps = { now, viewerId, canComment, canModerate, onReply, onSetThreadStatus, onEditComment, onDeleteComment };
  const target = groups.length === 1 ? groups[0] : null;

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-labelledby="review-threads-heading">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="review-threads-heading" className="text-label-m">
          Comments
        </h2>
        {canComment && onCommentingChange ? (
          <Button size="xs" variant={commenting ? 'default' : 'outline'} aria-pressed={commenting} aria-keyshortcuts="C" onClick={() => onCommentingChange(!commenting)}>
            <MessageSquarePlus /> Comment
            <Kbd aria-hidden className={cn('ml-0.5 h-4 min-w-4 text-[10px]', commenting && 'bg-primary-foreground/20 text-primary-foreground')}>
              C
            </Kbd>
          </Button>
        ) : null}
      </header>

      {commenting ? (
        <p className="animate-rise-in rounded-md bg-accent-subtle px-2.5 py-2 text-label-xs text-accent-text">
          Click the screenshot to pin a comment, or drag to mark an area. <Kbd>Esc</Kbd> to stop.
        </p>
      ) : null}

      {all.length > 0 ? (
        <SegmentedControl
          aria-label="Show comments"
          value={filter}
          onValueChange={(v) => onFilterChange(v as ThreadFilter)}
          className="w-full [&>button]:flex-1"
          items={THREAD_FILTERS.map((f) => {
            const count = f === 'open' ? open : f === 'resolved' ? resolved : all.length;
            return {
              value: f,
              'aria-label': `${THREAD_FILTER_LABELS[f]}, ${count}`,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {THREAD_FILTER_LABELS[f]}
                  <span className="text-label-xs text-muted-foreground tabular-nums">{count}</span>
                </span>
              ),
            };
          })}
        />
      ) : null}

      {groups.map((g) => {
        const shown = sortThreads(g.threads.filter((t) => matchesThreadFilter(t, filter)));
        if (!shown.length && several) return null;
        return (
          <div key={g.captureId} className="flex flex-col gap-1">
            {several ? <h3 className="text-label-xs text-muted-foreground capitalize">{g.variant}</h3> : null}
            <ol className="flex flex-col gap-1">
              {shown.map((t) => (
                <li key={t.id}>
                  <ThreadRow
                    thread={t}
                    captureId={g.captureId}
                    now={now}
                    open={openThreadId === t.id}
                    canComment={canComment}
                    onOpen={() => onOpenThreadChange?.(openThreadId === t.id ? null : t.id)}
                    onHighlight={onHighlight}
                    onSetThreadStatus={onSetThreadStatus}
                  />
                  {openThreadId === t.id && t.anchor.kind === 'image' ? (
                    <div className="mt-1 animate-rise-in rounded-lg border border-border bg-surface p-3">
                      <ThreadView thread={t} captureId={g.captureId} {...threadProps} autoFocusReply />
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        );
      })}

      {all.length === 0 ? (
        <p className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-5 text-center text-label-s text-muted-foreground">
          <MessageSquare aria-hidden className="size-4" />
          <span>
            {canComment ? (
              <>
                No comments yet. Press <Kbd>C</Kbd> and click the screenshot to point at what should change.
              </>
            ) : (
              'No comments on this image.'
            )}
          </span>
        </p>
      ) : all.every((t) => !matchesThreadFilter(t, filter)) ? (
        <p className="text-label-s text-muted-foreground">{filter === 'open' ? 'Every thread is resolved.' : 'No resolved threads.'}</p>
      ) : null}

      {canComment && onCreateThread && target ? (
        composing ? (
          <div className="animate-rise-in rounded-lg border border-border bg-surface p-3">
            <CommentComposer
              label="Comment on the whole image"
              placeholder="A comment about the whole image…"
              autoFocus
              onCancel={() => onComposingChange?.(false)}
              onSubmit={(body) => {
                onCreateThread({ captureId: target.captureId, anchor: { kind: 'image', x: 0, y: 0 }, body });
                onComposingChange?.(false);
              }}
            />
          </div>
        ) : (
          <Button size="xs" variant="ghost" className="self-start text-muted-foreground" onClick={() => onComposingChange?.(true)}>
            <MessageSquare /> Comment on the whole image
          </Button>
        )
      ) : null}
    </section>
  );
}

function ThreadRow({
  thread,
  captureId,
  now,
  open,
  canComment,
  onOpen,
  onHighlight,
  onSetThreadStatus,
}: {
  thread: ReviewThreadView;
  captureId: string;
  now?: Date;
  open: boolean;
  canComment: boolean;
  onOpen: () => void;
  onHighlight?: (threadId: string | null) => void;
  onSetThreadStatus?: ThreadActions['onSetThreadStatus'];
}) {
  const first = openingComment(thread);
  const answers = replies(thread);
  const resolved = thread.status === 'resolved';
  const people = [...new Map(answers.filter((c) => c.author).map((c) => [c.author!.name, c.author!])).values()].slice(0, 3);
  const name = first?.author?.name ?? 'AI assistant';
  return (
    <div
      className={cn(
        'group/row relative flex gap-2.5 rounded-lg p-2 transition-colors duration-150',
        open ? 'bg-accent-subtle ring-1 ring-accent-border' : 'hover:bg-muted',
        thread.pending && 'opacity-60',
      )}
      onMouseEnter={() => onHighlight?.(thread.id)}
      onMouseLeave={() => onHighlight?.(null)}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full rounded-bl-[3px] px-1 text-label-xs tabular-nums',
          resolved ? 'bg-muted text-muted-foreground ring-1 ring-border' : thread.placement === 'outdated' ? 'bg-surface text-accent-text outline-2 outline-dashed outline-accent-solid -outline-offset-2' : 'bg-accent-solid text-accent-on-solid',
        )}
      >
        {thread.number}
      </span>
      <button
        type="button"
        onClick={onOpen}
        onFocus={() => onHighlight?.(thread.id)}
        onBlur={() => onHighlight?.(null)}
        aria-expanded={open}
        className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
      >
        <span className="sr-only">
          Thread {thread.number}
          {resolved ? ', resolved' : ''}:{' '}
        </span>
        <span className="flex items-center gap-1.5 text-label-xs text-muted-foreground">
          <span className="truncate text-label-s text-foreground">{name}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{thread.pending ? 'Posting…' : formatRelative(first?.at ?? thread.createdAt, { now })}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 text-sm text-pretty break-words">{first?.body ?? ''}</span>
        {answers.length || thread.placement === 'outdated' || thread.anchor.kind === 'image' ? (
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label-xs text-muted-foreground">
            {answers.length ? (
              <span className="inline-flex items-center gap-1">
                {people.length ? (
                  <span className="flex -space-x-1.5" aria-hidden>
                    {people.map((p) => (
                      <ProfileAvatar key={p.name} name={p.name} image={p.image} size="sm" className="size-4 ring-1 ring-surface" fallbackClassName="text-[8px]" />
                    ))}
                  </span>
                ) : null}
                {answers.length} {answers.length === 1 ? 'reply' : 'replies'}
              </span>
            ) : null}
            {thread.anchor.kind === 'image' ? <span>Whole image</span> : null}
            {thread.placement === 'outdated' ? (
              <span className="inline-flex items-center gap-1">
                <History aria-hidden className="size-3" /> From {thread.originRunNumber ? `#${thread.originRunNumber}` : 'an earlier run'} · image changed
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      {canComment && onSetThreadStatus && !thread.pending ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={resolved ? `Reopen thread ${thread.number}` : `Resolve thread ${thread.number}`}
          className={cn('relative z-10 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100', resolved && 'opacity-100')}
          onClick={() => onSetThreadStatus({ threadId: thread.id, status: resolved ? 'open' : 'resolved', captureId })}
        >
          {resolved ? <RotateCcw /> : <Check />}
        </Button>
      ) : null}
    </div>
  );
}
