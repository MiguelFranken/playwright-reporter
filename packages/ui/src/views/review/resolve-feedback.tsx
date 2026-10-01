'use client';

import { Check, ChevronLeft, ChevronRight, CircleCheckBig, History, ListChecks, MessageSquareWarning, PencilLine, RotateCcw } from 'lucide-react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { Progress } from '../../components/progress';
import { SegmentedControl } from '../../components/segmented-control';
import { cn } from '../../lib/cn';
import { FEEDBACK_SCOPE_LABELS, FEEDBACK_SCOPES, type FeedbackScope } from '../../lib/feedback-queue';
import type { FrameSize, ReviewCaptureView, ReviewImage } from '../../lib/review';
import { ScreenFrame } from './screen-frame';

export interface ResolveBarProps {
  /** The item on show, from 0; `-1` while none is (the end, or a screen without feedback). */
  index: number;
  total: number;
  /** How many of them are resolved. */
  done: number;
  scope: FeedbackScope;
  /** Open items per scope, as the flows are now. */
  counts: Record<FeedbackScope, number>;
  onScopeChange: (next: FeedbackScope) => void;
  onStep: (delta: 1 | -1) => void;
  className?: string;
}

/**
 * The strip across the viewer while feedback is being resolved: where you are
 * in it, how much is done, which feedback (what changed since, what did not,
 * or all of it) and the way to the next and previous item.
 */
export function ResolveBar({ index, total, done, scope, counts, onScopeChange, onStep, className }: ResolveBarProps) {
  return (
    <div role="group" aria-label="Resolving feedback" className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent-border bg-accent-subtle px-3 py-1.5 text-accent-text', className)}>
      <ListChecks aria-hidden className="size-4 shrink-0" />
      <p className="text-label-m">
        Resolving feedback
        {total ? (
          <span className="ml-2 text-label-s tabular-nums" aria-live="polite">
            {index >= 0 && index < total ? `${index + 1} of ${total}` : `${total} in all`}
          </span>
        ) : null}
      </p>
      {total ? (
        <div className="flex items-center gap-2">
          <Progress value={(done / total) * 100} aria-label={`${done} of ${total} resolved`} className="w-20 [&_[data-slot=progress-indicator]]:bg-accent-solid [&_[data-slot=progress-track]]:bg-surface" />
          <span className="text-label-xs tabular-nums">{done} resolved</span>
        </div>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SegmentedControl
          aria-label="Feedback to go through"
          value={scope}
          onValueChange={(v) => onScopeChange(v as FeedbackScope)}
          className="bg-surface"
          items={FEEDBACK_SCOPES.map((s) => ({
            value: s,
            label: (
              <>
                {FEEDBACK_SCOPE_LABELS[s]}
                <span className="ml-1 tabular-nums opacity-70">{counts[s]}</span>
              </>
            ),
            'aria-label': `${FEEDBACK_SCOPE_LABELS[s]}, ${counts[s]}`,
          }))}
        />
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label="Previous feedback" aria-keyshortcuts="[" disabled={index <= 0} onClick={() => onStep(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next feedback" aria-keyshortcuts="]" disabled={!total || index >= total} onClick={() => onStep(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface ResolveDoneProps {
  /** Resolved of what was gone through. */
  resolved: number;
  /** Still open of what was gone through: skipped, or answered without resolving. */
  open: number;
  scope: FeedbackScope;
  /** Go through what is still open, from the first. */
  onRestart?: () => void;
  onClose: () => void;
}

/** The end of the feedback: what was resolved, what is still open, and the way back. */
export function ResolveDone({ resolved, open, scope, onRestart, onClose }: ResolveDoneProps) {
  const nothing = resolved + open === 0;
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center" role="status">
      <CircleCheckBig aria-hidden className={cn('size-8', open ? 'text-muted-foreground' : 'text-success-text')} />
      <div className="flex flex-col gap-0.5">
        <p className="text-title-s">{nothing ? `Nothing ${scope === 'all' ? 'open' : FEEDBACK_SCOPE_LABELS[scope].toLowerCase()}` : open ? 'You are through the feedback' : 'All feedback resolved'}</p>
        <p className="text-label-s text-muted-foreground">
          {nothing
            ? scope === 'verify'
              ? 'No screen changed since its feedback. Run the tests after a fix, and it shows up here.'
              : 'No open comments or change requests here.'
            : `${resolved} resolved${open ? ` · ${open} still open` : ''}.`}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {open && onRestart ? (
          <Button size="sm" onClick={onRestart}>
            <RotateCcw /> Go through the {open} still open
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onClose}>
          Back to the library
        </Button>
      </div>
    </div>
  );
}

export interface RequestVerifyProps {
  request: NonNullable<ReviewCaptureView['request']>;
  /** The image the changes were asked for on, when it is not this one and is still stored. */
  then?: ReviewImage | null;
  image: ReviewImage;
  frame: FrameSize;
  zoom: number;
  label: string;
  currentLabel?: string;
  /** Approve the screen as it is now: the request is done. */
  onApprove?: () => void;
  approving?: boolean;
  /** Point at what should change: comment mode on the screen. */
  onPin?: () => void;
  onSkip?: () => void;
  index?: number;
  total?: number;
}

/**
 * Changes asked for without a comment, while resolving feedback: nobody said
 * what, so the image asked about is shown beside the screen as it is now,
 * and approving it is how the request is done.
 */
export function RequestVerify({ request, then, image, frame, zoom, label, currentLabel = 'Now', onApprove, approving, onPin, onSkip, index = 0, total = 1 }: RequestVerifyProps) {
  const who = `${request.by ?? 'Someone'}${request.runNumber ? ` (run #${request.runNumber})` : ''}`;
  const here = request.onThisImage;
  return (
    <div className="flex min-w-max flex-col items-center gap-4" role="group" aria-label={here ? 'Change request, unchanged' : 'Verify the change request'}>
      <header
        className={cn(
          'flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2',
          here ? 'border-border bg-surface-sunken text-foreground' : 'border-info-border bg-info-subtle text-info-text',
        )}
      >
        {here ? <MessageSquareWarning aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <History aria-hidden className="size-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-label-m">
            {here ? 'Changes requested' : 'Verify the change request'}
            {total > 1 ? <span className="ml-1.5 text-label-s tabular-nums">({index + 1} of {total})</span> : null}
          </p>
          <p className={cn('text-label-xs', here && 'text-muted-foreground')}>
            {here ? `${who} asked for changes to this image without saying what. It has not changed since.` : `${who} asked for changes to an earlier version, without a comment. It changed since: is it what was asked?`}
          </p>
        </div>
      </header>
      <div className="flex items-start justify-center gap-6">
        {!here ? (
          <figure className="flex flex-col gap-1.5">
            <figcaption className="flex items-center gap-1.5 text-label-s text-muted-foreground">
              <History aria-hidden className="size-3.5" /> Asked about{request.runNumber ? ` · run #${request.runNumber}` : ''}
            </figcaption>
            {then ? (
              <ScreenFrame image={then} frame={frame} zoom={zoom} alt={`${label} — the version changes were asked for on`} eager />
            ) : (
              <div className="flex items-center justify-center rounded-md bg-surface-sunken p-6 text-center text-label-s text-muted-foreground ring-1 ring-border" style={{ width: frame.width * zoom, height: frame.height * zoom }}>
                The image the changes were asked for on is not shown here.
              </div>
            )}
          </figure>
        ) : null}
        <figure className="flex flex-col gap-1.5">
          <figcaption className="text-label-s text-muted-foreground">{currentLabel}</figcaption>
          <ScreenFrame image={image} frame={frame} zoom={zoom} alt={`${label} — now`} eager />
        </figure>
      </div>
      {onApprove || onPin || onSkip ? (
        <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Was it done?">
          {onApprove ? (
            <Button size="sm" variant={here ? 'outline' : 'default'} disabled={approving} onClick={onApprove} aria-keyshortcuts="A">
              <Check /> {approving ? 'Saving…' : here ? 'Approve anyway' : 'Done — approve'}
              <Kbd aria-hidden className={cn('ml-0.5 h-4 min-w-4 text-[10px]', here ? '' : 'bg-primary-foreground/20 text-primary-foreground')}>
                A
              </Kbd>
            </Button>
          ) : null}
          {here && onPin ? (
            <Button size="sm" variant="outline" onClick={onPin}>
              <PencilLine /> Pin what should change
            </Button>
          ) : null}
          {onSkip && total > 1 ? (
            <Button size="sm" variant="ghost" onClick={onSkip} aria-keyshortcuts="]">
              Skip
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
