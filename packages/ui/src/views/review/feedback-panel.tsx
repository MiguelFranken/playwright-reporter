'use client';

import { Check, ChevronLeft, ChevronRight, Columns2, Image as ImageIcon, ListChecks, MessageSquareWarning, X } from 'lucide-react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { Progress } from '../../components/progress';
import { SegmentedControl } from '../../components/segmented-control';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/tooltip';
import { cn } from '../../lib/cn';
import { FEEDBACK_SCOPE_LABELS, FEEDBACK_SCOPES, type FeedbackScope } from '../../lib/feedback-queue';

/** One piece of feedback in the round, as the panel lists it. */
export interface FeedbackEntry {
  key: string;
  /** The screen it is on: `3. Checkout · desktop`. Entries of one screen are listed under it. */
  screen: string;
  /** The thread's number; null for a change request nobody wrote a comment for. */
  number: number | null;
  /** The first words of its opening comment. */
  excerpt: string;
  /** The screen changed since it was given (`verify`), or not (`waiting`). */
  stage: 'verify' | 'waiting';
  /** Resolved (or approved over) in this round. */
  done: boolean;
}

export interface FeedbackPanelProps {
  /** `resolve`: the library's round of open feedback, across screens. `verify`: the comments on this screen made on an earlier version. */
  mode: 'resolve' | 'verify';
  entries: readonly FeedbackEntry[];
  /** The entry on show; null at the end, or while none is. */
  currentKey: string | null;
  onGo: (key: string) => void;
  onStep: (delta: 1 | -1) => void;
  /** Which feedback the round goes through (resolve only). */
  scope?: FeedbackScope;
  counts?: Record<FeedbackScope, number>;
  onScopeChange?: (next: FeedbackScope) => void;
  /** The stage compares the feedback's screens; off, it shows the screen as usual (O). */
  comparing: boolean;
  onComparingChange?: (next: boolean) => void;
  /** Leave the round (verify only: the library's round ends by closing the viewer). */
  onClose?: () => void;
  /** The entry on show: its thread, or its change request; the end of the round in its place. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The side panel while feedback is gone through: where you are in the round
 * and how much is resolved, which feedback, the one on show with its
 * conversation and what to do about it — and every other thread of the round,
 * by screen, to jump to. The stage keeps the whole space for the screens.
 */
export function FeedbackPanel({
  mode,
  entries,
  currentKey,
  onGo,
  onStep,
  scope,
  counts,
  onScopeChange,
  comparing,
  onComparingChange,
  onClose,
  children,
  className,
}: FeedbackPanelProps) {
  const total = entries.length;
  const done = entries.filter((e) => e.done).length;
  const index = currentKey ? entries.findIndex((e) => e.key === currentKey) : -1;
  const screens = [...new Set(entries.map((e) => e.screen))];
  const title = mode === 'resolve' ? 'Resolving feedback' : 'Verifying comments';
  return (
    <section className={cn('flex flex-col gap-4', className)} aria-label={title}>
      <header className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <ListChecks aria-hidden className="size-4 shrink-0 text-accent-text" />
          <h2 className="min-w-0 flex-1 truncate text-label-m">{title}</h2>
          {onComparingChange ? (
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label={comparing ? 'Show the screen' : 'Compare again'} aria-keyshortcuts="O" onClick={() => onComparingChange(!comparing)} />}
              >
                {comparing ? <ImageIcon /> : <Columns2 />}
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {comparing ? 'Show the screen' : 'Compare again'} <Kbd>O</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}
          {onClose ? (
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Stop verifying" onClick={onClose} />}>
                <X />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Stop verifying <Kbd>Esc</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {total ? (
          <div className="flex items-center gap-2.5 text-label-xs text-muted-foreground">
            <span className="text-label-s text-foreground tabular-nums" aria-live="polite">
              {index >= 0 ? `${index + 1} of ${total}` : `${total} in all`}
            </span>
            <Progress value={(done / total) * 100} aria-label={`${done} of ${total} resolved`} className="flex-1 [&_[data-slot=progress-indicator]]:bg-success-solid" />
            <span className="tabular-nums">{done} resolved</span>
            <div className="flex items-center">
              <Button variant="ghost" size="icon-xs" aria-label="Previous feedback" aria-keyshortcuts="[" disabled={index === 0} onClick={() => onStep(-1)}>
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Next feedback" aria-keyshortcuts="]" disabled={index < 0 && currentKey == null && done === total} onClick={() => onStep(1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
        {mode === 'resolve' && scope && counts && onScopeChange ? (
          <SegmentedControl
            aria-label="Feedback to go through"
            size="sm"
            value={scope}
            onValueChange={(v) => onScopeChange(v as FeedbackScope)}
            className="w-full [&>button]:flex-1"
            items={FEEDBACK_SCOPES.map((s) => ({
              value: s,
              label: (
                <span className="inline-flex items-center gap-1">
                  {FEEDBACK_SCOPE_LABELS[s]}
                  <span className="text-label-xs text-muted-foreground tabular-nums">{counts[s]}</span>
                </span>
              ),
              'aria-label': `${FEEDBACK_SCOPE_LABELS[s]}, ${counts[s]}`,
            }))}
          />
        ) : null}
      </header>

      {children}

      {total > 1 ? (
        <nav className="flex flex-col gap-3 border-t border-border pt-3" aria-label="Feedback in this round">
          {screens.map((screen) => (
            <div key={screen} className="flex flex-col gap-1">
              <h3 className="truncate px-1 text-label-xs text-muted-foreground" title={screen}>
                {screen}
              </h3>
              <ol className="flex flex-col gap-0.5">
                {entries
                  .filter((e) => e.screen === screen)
                  .map((e) => {
                    const current = e.key === currentKey;
                    return (
                      <li key={e.key}>
                        <button
                          type="button"
                          onClick={() => onGo(e.key)}
                          aria-current={current ? 'step' : undefined}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40',
                            current ? 'bg-accent-subtle ring-1 ring-accent-border' : 'hover:bg-muted',
                          )}
                        >
                          {e.number != null ? (
                            <span
                              aria-hidden
                              className={cn(
                                'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full rounded-bl-[3px] px-1 text-label-xs tabular-nums',
                                e.done ? 'bg-muted text-muted-foreground' : e.stage === 'verify' ? 'bg-surface text-accent-text outline-2 -outline-offset-2 outline-accent-solid outline-dashed' : 'bg-accent-solid text-accent-on-solid',
                              )}
                            >
                              {e.number}
                            </span>
                          ) : (
                            <MessageSquareWarning aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className={cn('min-w-0 flex-1 truncate text-sm', e.done && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
                            <span className="sr-only">{e.number != null ? `Comment ${e.number}: ` : 'Change request: '}</span>
                            {e.excerpt}
                            {e.done ? <span className="sr-only">, resolved</span> : null}
                          </span>
                          {e.done ? <Check aria-hidden className="size-3.5 shrink-0 text-success-text" /> : null}
                        </button>
                      </li>
                    );
                  })}
              </ol>
            </div>
          ))}
        </nav>
      ) : null}
    </section>
  );
}
