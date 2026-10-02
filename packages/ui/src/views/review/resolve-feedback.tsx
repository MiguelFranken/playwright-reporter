'use client';

import { Check, CircleCheckBig, MessageSquareWarning, PencilLine, RotateCcw, SkipForward } from 'lucide-react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { cn } from '../../lib/cn';
import { FEEDBACK_SCOPE_LABELS, type FeedbackScope } from '../../lib/feedback-queue';
import type { ReviewCaptureView } from '../../lib/review';
import { FeedbackStageNote } from './thread-verify';

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

export interface FeedbackRequestCardProps {
  request: NonNullable<ReviewCaptureView['request']>;
  /** Approve the screen as it is now: the request is done. */
  onApprove?: () => void;
  approving?: boolean;
  /** Point at what should change: comment mode on the screen. */
  onPin?: () => void;
  /** Leave it and go on to the next one. */
  onNext?: () => void;
}

/**
 * Changes asked for without a comment, while resolving feedback: nobody said
 * what, so the stage shows the image asked about beside the screen as it is
 * now, and approving it is how the request is done.
 */
export function FeedbackRequestCard({ request, onApprove, approving, onPin, onNext }: FeedbackRequestCardProps) {
  const who = `${request.by ?? 'Someone'}${request.runNumber ? ` (run #${request.runNumber})` : ''}`;
  const here = request.onThisImage;
  return (
    <section className="flex flex-col gap-3" aria-label={here ? 'Change request, unchanged' : 'Verify the change request'}>
      <p className="flex items-center gap-2 text-label-m">
        <MessageSquareWarning aria-hidden className="size-4 text-muted-foreground" /> {here ? 'Changes requested' : 'Verify the change request'}
      </p>
      <FeedbackStageNote stage={here ? 'waiting' : 'verify'}>
        {here ? `${who} asked for changes to this image without saying what. It has not changed since.` : `${who} asked for changes to an earlier version, without a comment. It changed since: is it what was asked?`}
      </FeedbackStageNote>
      {onApprove || onPin || onNext ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Was it done?">
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
          {onNext ? (
            <Button size="sm" variant="ghost" onClick={onNext} aria-keyshortcuts="]">
              <SkipForward /> Next
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
