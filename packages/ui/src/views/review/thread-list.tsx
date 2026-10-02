'use client';

import { ArrowRight, Bot, Check, CheckCheck, Columns2, History, MessageSquare, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { SegmentedControl } from '../../components/segmented-control';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import {
  commentAuthorName,
  isAgentComment,
  matchesThreadFilter,
  openingComment,
  replies,
  sortThreads,
  THREAD_FILTER_LABELS,
  THREAD_FILTERS,
  THREAD_STAGE_LABELS,
  threadStage,
  type ReviewThreadView,
  type ThreadStage,
  type ThreadActions,
  type ThreadFilter,
} from '../../lib/review-threads';
import { COMMENT_TOOL_HINTS, markupColors, MARKUP_COLOR_LABELS, type CommentTool } from '../../lib/review-markup';
import { CommentComposer } from '../../patterns/comment-composer';
import { MarkupSwatch } from '../../patterns/markup-shapes';
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
  /** Comment mode is on; with `onCommentingChange`, the list has its own button for it and says how to use it. */
  commenting?: boolean;
  /** The tool comment mode places comments with, for its hint. */
  commentTool?: CommentTool;
  onCommentingChange?: (next: boolean) => void;
  /** The whole-image composer is open. */
  composing?: boolean;
  onComposingChange?: (next: boolean) => void;
  now?: Date;
  viewerId?: string | null;
  canComment?: boolean;
  canModerate?: boolean;
  /** Walk through the comments to verify, one by one; `threadId` starts at that one. */
  onVerify?: (threadId?: string) => void;
  /** Beside the heading: a hand-off of the open comments to an AI assistant. */
  headerActions?: React.ReactNode;
  /** Where comments are placed from when the list has no button for it: said when there are none yet. */
  emptyHint?: React.ReactNode;
  className?: string;
}

const STAGE_HINTS: Record<ThreadStage, string> = {
  verify: 'The screen changed since these were made.',
  waiting: 'Nothing changed where these point yet.',
  resolved: '',
};

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
  commentTool = 'pin',
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
  onCompareThread,
  onVerify,
  headerActions,
  emptyHint,
  className,
}: ThreadListProps) {
  const all = groups.flatMap((g) => g.threads);
  const open = all.filter((t) => t.status === 'open').length;
  const resolved = all.length - open;
  // With nothing resolved, every filter shows the same threads: there is no filter to offer.
  const filtering = resolved > 0;
  const shownFilter: ThreadFilter = filtering ? filter : 'open';
  const several = groups.length > 1;
  const threadProps = { now, viewerId, canComment, canModerate, onReply, onSetThreadStatus, onEditComment, onDeleteComment, onCompareThread };
  const target = groups.length === 1 ? groups[0] : null;
  const toVerify = all.filter((t) => threadStage(t) === 'verify');

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-labelledby="review-threads-heading">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="review-threads-heading" className="text-label-m">
            Comments
          </h2>
          {all.length ? (
            <span className={cn('rounded-full px-1.5 text-label-xs tabular-nums', open ? 'bg-accent-subtle text-accent-text' : 'bg-muted text-muted-foreground')}>
              {open ? `${open} open` : 'all resolved'}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {headerActions}
          {canComment && onCommentingChange ? (
            <Button size="xs" variant={commenting ? 'default' : 'outline'} aria-pressed={commenting} aria-keyshortcuts="C" onClick={() => onCommentingChange(!commenting)}>
              <MessageSquarePlus /> Comment
              <Kbd aria-hidden className={cn('ml-0.5 h-4 min-w-4 text-[10px]', commenting && 'bg-primary-foreground/20 text-primary-foreground')}>
                C
              </Kbd>
            </Button>
          ) : null}
        </div>
      </header>

      {toVerify.length > 0 && onVerify ? (
        <div className="flex animate-rise-in items-center gap-2.5 rounded-lg border border-info-border bg-info-subtle p-2.5 text-info-text">
          <History aria-hidden className="size-4 shrink-0" />
          <p className="min-w-0 flex-1 text-label-xs">
            <span className="block text-label-s">
              {toVerify.length} {toVerify.length === 1 ? 'comment' : 'comments'} to verify
            </span>
            The screen changed since {toVerify.length === 1 ? 'it was' : 'they were'} made. Was {toVerify.length === 1 ? 'it' : 'each'} fixed?
          </p>
          <Button size="xs" onClick={() => onVerify()} aria-keyshortcuts="O">
            Verify <ArrowRight />
          </Button>
        </div>
      ) : null}

      {commenting && onCommentingChange ? (
        <p className="animate-rise-in rounded-md bg-accent-subtle px-2.5 py-2 text-label-xs text-accent-text">
          {COMMENT_TOOL_HINTS[commentTool]} <Kbd>Esc</Kbd> to stop.
        </p>
      ) : null}

      {filtering ? (
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
        const shown = sortThreads(g.threads.filter((t) => matchesThreadFilter(t, shownFilter)));
        if (!shown.length && several) return null;
        const groupOpen = g.threads.filter((t) => t.status === 'open').length;
        const stages = (['verify', 'waiting', 'resolved'] as const).map((stage) => ({ stage, threads: shown.filter((t) => threadStage(t) === stage) })).filter((s) => s.threads.length);
        // Sections only when they tell threads apart.
        const sectioned = stages.length > 1;
        return (
          <div key={g.captureId} className="flex flex-col gap-2">
            {several ? (
              <h3 className="flex items-center gap-2 border-b border-border pb-1 text-label-s capitalize">
                {g.variant}
                <span className="text-label-xs text-muted-foreground normal-case tabular-nums">{groupOpen ? `${groupOpen} open` : 'all resolved'}</span>
              </h3>
            ) : null}
            {stages.map(({ stage, threads }) => (
              <div key={stage} className="flex flex-col gap-1">
                {sectioned ? (
                  <p className="flex items-baseline gap-1.5 px-2 text-label-xs text-muted-foreground" title={STAGE_HINTS[stage] || undefined}>
                    <span className="text-label-s text-foreground">{THREAD_STAGE_LABELS[stage]}</span>
                    <span className="tabular-nums">{threads.length}</span>
                  </p>
                ) : null}
                <ol className="flex flex-col gap-1" aria-label={sectioned ? THREAD_STAGE_LABELS[stage] : undefined}>
                  {threads.map((t) => (
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
                        onCompare={onVerify ?? onCompareThread}
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
            ))}
          </div>
        );
      })}

      {all.length === 0 ? (
        <p className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-5 text-center text-label-s text-muted-foreground">
          <MessageSquare aria-hidden className="size-4" />
          <span>
            {canComment ? (
              (emptyHint ?? (
                <>
                  No comments yet. Press <Kbd>C</Kbd> and click the screenshot to point at what should change.
                </>
              ))
            ) : (
              'No comments on this image.'
            )}
          </span>
        </p>
      ) : all.every((t) => !matchesThreadFilter(t, shownFilter)) ? (
        shownFilter === 'open' ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface-sunken px-3 py-4 text-center">
            <CheckCheck aria-hidden className="size-4 text-success-text" />
            <p className="text-label-s">
              {resolved === 1 ? 'The one comment is resolved.' : `All ${resolved} comments are resolved.`}
            </p>
            <Button size="xs" variant="outline" onClick={() => onFilterChange('resolved')}>
              Show resolved
            </Button>
          </div>
        ) : (
          <p className="text-label-s text-muted-foreground">No resolved threads.</p>
        )
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
  onCompare,
}: {
  thread: ReviewThreadView;
  captureId: string;
  now?: Date;
  open: boolean;
  canComment: boolean;
  onOpen: () => void;
  onHighlight?: (threadId: string | null) => void;
  onSetThreadStatus?: ThreadActions['onSetThreadStatus'];
  onCompare?: ThreadActions['onCompareThread'];
}) {
  const first = openingComment(thread);
  const answers = replies(thread);
  const resolved = thread.status === 'resolved';
  // People who replied; an agent's reply is the agent's, said on its own below.
  const people = [...new Map(answers.filter((c) => c.author && !isAgentComment(c)).map((c) => [c.author!.name, c.author!])).values()].slice(0, 3);
  const name = commentAuthorName(first);
  // The newest reply, when an agent wrote it: what it says it changed is what a reviewer checks next.
  const last = answers.at(-1);
  const agentReply = last && isAgentComment(last) ? last : null;
  // The colours drawn with it: a comment saying "the blue area" is found by its swatch.
  const inks = markupColors(thread.markup);
  return (
    <div
      className={cn(
        'group/row relative flex gap-2.5 rounded-lg p-2 transition-colors duration-150',
        open ? 'bg-accent-subtle ring-1 ring-accent-border' : 'hover:bg-muted',
        thread.pending && 'pending overflow-hidden',
      )}
      aria-busy={thread.pending || undefined}
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
          {first && isAgentComment(first) ? <span className="shrink-0">agent</span> : null}
          <span aria-hidden>·</span>
          <span className="shrink-0">{thread.pending ? 'Posting…' : formatRelative(first?.at ?? thread.createdAt, { now })}</span>
          {inks.length ? (
            <span className="ms-auto flex shrink-0 items-center gap-0.5" title={`Drawn in ${inks.map((c) => MARKUP_COLOR_LABELS[c].toLowerCase()).join(', ')}`}>
              <span className="sr-only">, drawn in {inks.map((c) => MARKUP_COLOR_LABELS[c].toLowerCase()).join(', ')}</span>
              {inks.map((c) => (
                <MarkupSwatch key={c} color={c} className="size-2" />
              ))}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 line-clamp-2 text-sm text-pretty break-words">{first?.body ?? ''}</span>
        {agentReply ? (
          <span className="mt-1 flex items-start gap-1.5 rounded-md bg-accent-subtle/60 px-1.5 py-1 text-label-xs text-accent-text">
            <Bot aria-hidden className="mt-px size-3 shrink-0" />
            <span className="min-w-0 line-clamp-2">
              <span className="text-label-xs">{commentAuthorName(agentReply)} replied:</span> {agentReply.body}
            </span>
          </span>
        ) : null}
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
                <History aria-hidden className="size-3" /> Made on {thread.originRunNumber ? `#${thread.originRunNumber}` : 'an earlier run'} · screen changed since
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      {thread.origin && onCompare && !resolved ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Verify thread ${thread.number} against the version commented on`}
          title="Verify the fix"
          className="relative z-10 text-info-text"
          onClick={() => onCompare(thread.id)}
        >
          <Columns2 />
        </Button>
      ) : null}
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
