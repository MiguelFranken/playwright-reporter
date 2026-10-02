'use client';

import { Check, CircleCheckBig, History, MessageSquareReply, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { CommentPin } from '../../patterns/comment-pin';
import { cn } from '../../lib/cn';
import type { FractionAnchor, ReviewThreadView, ThreadActions } from '../../lib/review-threads';
import type { MarkupShape } from '../../lib/review-markup';
import { MarkupShapes } from '../../patterns/markup-shapes';
import { ThreadView } from './thread-view';

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

/** The pin as it was placed on the version commented on: not interactive, the conversation is beside it. */
export function OriginMarker({ number, anchor, markup }: { number: number; anchor: FractionAnchor; markup?: readonly MarkupShape[] | null }) {
  if (anchor.kind === 'image') return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {markup?.length ? (
        <MarkupShapes shapes={markup} />
      ) : anchor.kind === 'area' && anchor.w != null && anchor.h != null ? (
        <div className="absolute rounded-sm border-2 border-accent-solid bg-accent-solid/10" style={{ left: pct(anchor.x), top: pct(anchor.y), width: pct(anchor.w), height: pct(anchor.h) }} />
      ) : null}
      <div className="absolute -translate-y-full" style={{ left: pct(anchor.x), top: pct(anchor.y) }}>
        <CommentPin number={number} state="open" tabIndex={-1} className="pointer-events-none" />
      </div>
    </div>
  );
}

/** Where a piece of feedback stands: the screen changed since it was given, or it still looks the same. */
export function FeedbackStageNote({ stage, children }: { stage: 'verify' | 'waiting'; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-label-xs text-muted-foreground">
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-label-xs',
          stage === 'verify' ? 'bg-info-subtle text-info-text' : 'bg-muted text-muted-foreground',
        )}
      >
        {stage === 'verify' ? <History aria-hidden className="size-3" /> : null}
        {stage === 'verify' ? 'Changed since' : 'Unchanged'}
      </span>
      <span className="min-w-0 pt-px">{children}</span>
    </p>
  );
}

export interface FeedbackThreadCardProps extends Pick<ThreadActions, 'onReply' | 'onEditComment' | 'onDeleteComment'> {
  thread: ReviewThreadView;
  /**
   * `verify`: made on an earlier version, the screen changed since — the two
   * are side by side on the stage. `waiting`: the screen still shows the
   * pixels it was made on.
   */
  stage: 'verify' | 'waiting';
  /** The run the screen as it is now was captured in: whether it was captured again since the comment. */
  currentRunNumber?: number | null;
  /** The capture the thread is shown with: resolving records it. */
  captureId: string;
  now?: Date;
  viewerId?: string | null;
  canComment?: boolean;
  canModerate?: boolean;
  /** Mark it fixed; the host moves on to the next one. */
  onResolve?: () => void;
  /** Leave it open and go on to the next one. */
  onNext?: () => void;
  /** A hand-off to an AI assistant for this comment, beside resolve. */
  actions?: React.ReactNode;
}

/**
 * The comment being checked, in the side panel while the screens fill the
 * stage: whether the screen changed since it was made, the way to resolve it
 * (E) or answer it, the next one (]), and the whole conversation.
 */
export function FeedbackThreadCard({
  thread,
  stage,
  currentRunNumber,
  captureId,
  now,
  viewerId,
  canComment = false,
  canModerate = false,
  onResolve,
  onNext,
  actions,
  onReply,
  onEditComment,
  onDeleteComment,
}: FeedbackThreadCardProps) {
  const [replying, setReplying] = useState(false);
  const resolved = thread.status === 'resolved';
  const waiting = stage === 'waiting';
  const madeOn = thread.originRunNumber ? `run #${thread.originRunNumber}` : null;
  const recaptured = Boolean(currentRunNumber && thread.originRunNumber && currentRunNumber > thread.originRunNumber);
  return (
    <section className="flex flex-col gap-3" aria-label={waiting ? `Comment ${thread.number}, unchanged` : `Verify comment ${thread.number}`}>
      <FeedbackStageNote stage={stage}>
        {resolved
          ? 'Resolved.'
          : waiting
            ? recaptured
              ? `Captured again in run #${currentRunNumber}, and the same as${madeOn ? ` on ${madeOn}` : ' when it was made'}: not fixed yet.`
              : `Not captured again since${madeOn ? ` ${madeOn}` : ' the comment'}. Run the test after the fix, or resolve it if it is done.`
            : `Made on ${madeOn ?? 'an earlier version'}. Compare the two screens: was it fixed?`}
      </FeedbackStageNote>
      {canComment && !resolved ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Was it fixed?">
          {onResolve ? (
            <Button size="sm" variant={waiting ? 'outline' : 'default'} onClick={onResolve} aria-keyshortcuts="E">
              <Check /> {waiting ? 'Resolve' : 'Fixed — resolve'}
              <Kbd aria-hidden className={cn('ml-0.5 h-4 min-w-4 text-[10px]', waiting ? '' : 'bg-primary-foreground/20 text-primary-foreground')}>
                E
              </Kbd>
            </Button>
          ) : null}
          {onReply ? (
            <Button size="sm" variant="outline" aria-pressed={replying} onClick={() => setReplying(true)}>
              <MessageSquareReply /> {waiting ? 'Reply' : 'Not yet — reply'}
            </Button>
          ) : null}
          {onNext ? (
            <Button size="sm" variant="ghost" onClick={onNext} aria-keyshortcuts="]">
              <SkipForward /> Next
            </Button>
          ) : null}
        </div>
      ) : null}
      <ThreadView
        key={`${thread.id}-${replying}`}
        thread={thread}
        captureId={captureId}
        now={now}
        viewerId={viewerId}
        canComment={canComment}
        canModerate={canModerate}
        autoFocusReply={replying}
        actions={actions}
        showPlacement={false}
        onReply={onReply}
        onEditComment={onEditComment}
        onDeleteComment={onDeleteComment}
        className="rounded-lg border border-border bg-surface p-3"
      />
    </section>
  );
}

/** Every comment to verify has been looked at. */
export function VerifyDone({ count, onClose, next }: { count: number; onClose: () => void; /** What to do now: approve the screen. */ next?: React.ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center" role="status">
      <CircleCheckBig aria-hidden className="size-8 text-success-text" />
      <div>
        <p className="text-title-s">Nothing left to verify</p>
        <p className="text-label-s text-muted-foreground">
          {count ? `${count} ${count === 1 ? 'comment' : 'comments'} checked against this screen.` : 'Every comment on this screen is on its current version.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {next}
        <Button size="sm" variant="outline" onClick={onClose}>
          Back to the screen
        </Button>
      </div>
    </div>
  );
}
