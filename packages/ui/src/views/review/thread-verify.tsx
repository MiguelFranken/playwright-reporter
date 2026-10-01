'use client';

import { Check, ChevronLeft, ChevronRight, CircleCheckBig, History, MessageSquare, MessageSquareReply, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { SegmentedControl } from '../../components/segmented-control';
import { CommentPin } from '../../patterns/comment-pin';
import { cn } from '../../lib/cn';
import type { FrameSize, ReviewImage } from '../../lib/review';
import type { FractionAnchor, ReviewThreadView, ThreadActions } from '../../lib/review-threads';
import { PinCloseUp } from './pin-close-up';
import { ScreenFrame } from './screen-frame';
import { ThreadView } from './thread-view';

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

/** Close-ups of the spot, or the two whole screens. */
export type VerifyLayout = 'close-up' | 'screens';

export interface ThreadVerifyProps extends Pick<ThreadActions, 'onReply' | 'onEditComment' | 'onDeleteComment'> {
  thread: ReviewThreadView;
  /**
   * `verify`: made on an earlier version, the screen changed since — the two
   * side by side. `waiting`: the screen still shows the pixels it was made on
   * (resolving feedback goes through those too) — the spot once, as it is.
   */
  stage?: 'verify' | 'waiting';
  /** The run the screen as it is now was captured in: whether it was captured again since the comment. */
  currentRunNumber?: number | null;
  /** Where it is in the comments to verify: `index` of `total`. */
  index: number;
  total: number;
  /** The capture the thread is shown with: resolving records it. */
  captureId: string;
  /** The screen as it is now. */
  image: ReviewImage;
  frame: FrameSize;
  zoom: number;
  label: string;
  /** What the screen now is called: `This run`, `Now · run #486`. */
  currentLabel?: string;
  /** The width of one close-up; they sit two abreast. */
  closeUpWidth?: number;
  now?: Date;
  viewerId?: string | null;
  canComment?: boolean;
  canModerate?: boolean;
  /** The live pins on the screen now, for the whole-screens layout. */
  currentOverlay?: React.ReactNode;
  /** Mark it fixed; the host moves on to the next one. */
  onResolve?: () => void;
  onStep?: (delta: 1 | -1) => void;
  onClose: () => void;
  /** A hand-off to an AI assistant for this comment, beside resolve. */
  actions?: React.ReactNode;
  /** Controlled layout; uncontrolled when absent. */
  layout?: VerifyLayout;
  onLayoutChange?: (next: VerifyLayout) => void;
}

/**
 * Checking one comment after a fix: the comment was made on an earlier
 * version of the screen, the screen changed since, and somebody has to say
 * whether the change asked for was made. The spot it points at, magnified,
 * as it was and as it is now; the conversation under it; then "Fixed" to
 * resolve it and go on to the next, or a reply when it is not. The whole
 * screens are a toggle away. Nothing is resolved until a person says so.
 */
export function ThreadVerify({
  thread,
  stage = 'verify',
  currentRunNumber,
  index,
  total,
  captureId,
  image,
  frame,
  zoom,
  label,
  currentLabel = 'Now',
  closeUpWidth = 440,
  now,
  viewerId,
  canComment = false,
  canModerate = false,
  currentOverlay,
  onResolve,
  onStep,
  onClose,
  actions,
  layout: layoutProp,
  onLayoutChange,
  onReply,
  onEditComment,
  onDeleteComment,
}: ThreadVerifyProps) {
  const [ownLayout, setOwnLayout] = useState<VerifyLayout>('close-up');
  const layout = layoutProp ?? ownLayout;
  const setLayout = (next: VerifyLayout) => {
    setOwnLayout(next);
    onLayoutChange?.(next);
  };
  const [replying, setReplying] = useState(false);
  const origin = thread.origin;
  const resolved = thread.status === 'resolved';
  const waiting = stage === 'waiting';
  const madeOn = thread.originRunNumber ? `run #${thread.originRunNumber}` : null;
  const recaptured = Boolean(currentRunNumber && thread.originRunNumber && currentRunNumber > thread.originRunNumber);
  const then = `Commented on${thread.originRunNumber ? ` · run #${thread.originRunNumber}` : ''}`;
  const width = Math.max(240, Math.round(closeUpWidth));
  const height = Math.round(width * 0.62);

  return (
    <div className="flex min-w-max flex-col items-center gap-4" role="group" aria-label={waiting ? `Comment ${thread.number}, unchanged` : `Verify comment ${thread.number}`}>
      <header
        className={cn(
          'flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2',
          waiting ? 'border-border bg-surface-sunken text-foreground' : 'border-info-border bg-info-subtle text-info-text',
        )}
      >
        {waiting ? <MessageSquare aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <History aria-hidden className="size-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-label-m">
            {waiting ? `Comment ${thread.number}` : `Verify comment ${thread.number}`}
            {total > 1 ? <span className="ml-1.5 text-label-s tabular-nums">({index + 1} of {total})</span> : null}
          </p>
          <p className={cn('text-label-xs', waiting && 'text-muted-foreground')}>
            {resolved
              ? 'Resolved.'
              : waiting
                ? recaptured
                  ? `Captured again in run #${currentRunNumber}, and the same as when the comment was made${madeOn ? ` on ${madeOn}` : ''}: not fixed yet.`
                  : `Not captured again since the comment${madeOn ? ` on ${madeOn}` : ''}. Run the test after the fix — or resolve it if it is done.`
                : `Made on ${madeOn ?? 'an earlier version'}; the screen has changed since. Was it fixed?`}
          </p>
        </div>
        <SegmentedControl
          aria-label="Show"
          size="sm"
          value={layout}
          onValueChange={(v) => setLayout(v as VerifyLayout)}
          items={[
            { value: 'close-up', label: 'Close-up' },
            { value: 'screens', label: waiting ? 'Whole screen' : 'Whole screens' },
          ]}
        />
        {total > 1 && onStep ? (
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" aria-label="Previous comment to verify" onClick={() => onStep(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next comment to verify" onClick={() => onStep(1)}>
              <ChevronRight />
            </Button>
          </div>
        ) : null}
        <Button size="icon-sm" variant="ghost" aria-label="Stop verifying" onClick={onClose}>
          <X />
        </Button>
      </header>

      {waiting ? (
        <figure className="flex flex-col gap-1.5">
          <figcaption className="text-label-s text-muted-foreground">{currentLabel}</figcaption>
          {layout === 'close-up' ? (
            <PinCloseUp image={image} anchor={thread.anchor} number={thread.number} width={width} height={height} alt={`${label} — close-up of comment ${thread.number}`} />
          ) : (
            <ScreenFrame image={image} frame={frame} zoom={zoom} alt={`${label} — now`} eager overlay={currentOverlay ? () => currentOverlay : undefined} />
          )}
        </figure>
      ) : layout === 'close-up' ? (
        <div className="flex items-start justify-center gap-6">
          <figure className="flex flex-col gap-1.5">
            <figcaption className="flex items-center gap-1.5 text-label-s text-muted-foreground">
              <History aria-hidden className="size-3.5" /> {then}
            </figcaption>
            {origin ? (
              <PinCloseUp image={origin.image} anchor={origin.anchor} number={thread.number} width={width} height={height} alt={`${label} — close-up of comment ${thread.number}, as commented on`} />
            ) : (
              <p className="flex items-center justify-center rounded-md bg-surface-sunken p-6 text-center text-label-s text-muted-foreground ring-1 ring-border" style={{ width, height }}>
                The image this comment was made on is no longer stored.
              </p>
            )}
          </figure>
          <figure className="flex flex-col gap-1.5">
            <figcaption className="text-label-s text-muted-foreground">{currentLabel}</figcaption>
            <PinCloseUp image={image} anchor={thread.anchor} number={thread.number} state="outdated" width={width} height={height} alt={`${label} — close-up of comment ${thread.number}, now`} />
          </figure>
        </div>
      ) : (
        <div className="flex items-start justify-center gap-6">
          <figure className="flex flex-col gap-1.5">
            <figcaption className="flex items-center gap-1.5 text-label-s text-muted-foreground">
              <History aria-hidden className="size-3.5" /> {then}
            </figcaption>
            {origin ? (
              <ScreenFrame image={origin.image} frame={frame} zoom={zoom} alt={`${label} — the version commented on`} eager overlay={() => <OriginMarker number={thread.number} anchor={origin.anchor} />} />
            ) : (
              <div className="flex items-center justify-center rounded-md bg-surface-sunken p-6 text-center text-label-s text-muted-foreground ring-1 ring-border" style={{ width: frame.width * zoom, height: frame.height * zoom }}>
                The image this comment was made on is no longer stored.
              </div>
            )}
          </figure>
          <figure className="flex flex-col gap-1.5">
            <figcaption className="text-label-s text-muted-foreground">{currentLabel}</figcaption>
            <ScreenFrame image={image} frame={frame} zoom={zoom} alt={`${label} — now`} eager overlay={currentOverlay ? () => currentOverlay : undefined} />
          </figure>
        </div>
      )}

      <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-popover p-3 shadow-e1" style={{ maxWidth: layout === 'close-up' ? (waiting ? Math.max(width, 480) : width * 2 + 24) : 720 }}>
        {canComment && !resolved ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Was it fixed?">
            {onResolve ? (
              <Button size="sm" variant={waiting ? 'outline' : 'default'} onClick={onResolve} aria-keyshortcuts="E">
                <Check /> {waiting ? 'Done — resolve' : 'Fixed — resolve'}
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
            {total > 1 && onStep ? (
              <Button size="sm" variant="ghost" onClick={() => onStep(1)} aria-keyshortcuts="]">
                Skip
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
        />
      </div>
    </div>
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
