'use client';

import { GitCompareArrows, MessageSquare } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import { COMPARE_RULE_LABELS, parseCompareRule, type CompareRule, type CompareTargetView, type ReviewCaptureView } from '../../lib/review';

/** What the viewer's "Compare with" control reads and records; the host fetches the other runs and owns the rule. */
export interface CompareWithProps {
  rule: CompareRule;
  onRuleChange: (next: CompareRule) => void;
  /**
   * The other runs' captures of the open image's screen that still have
   * their image, newest first; `undefined` until they have loaded.
   */
  targets?: readonly CompareTargetView[] | null;
  /**
   * The reviewer is about to look at the list (it opens, or the pointer or
   * focus reaches its trigger): the host loads the other runs only then,
   * unless the rule needs them anyway.
   */
  onTargetsWanted?: () => void;
  /** The reference instant for relative times (stories pin it). */
  now?: Date;
}

const hint = 'ms-auto ps-4 text-end text-body-xs text-muted-foreground tabular-nums';

/**
 * Chooses what the open image is compared with: the approved baseline, the
 * run before, the newest image with open comments, or any of the last runs
 * that captured the same screen. The choice is a rule and holds while the
 * reviewer moves on; where it finds nothing, the viewer shows the default.
 */
export function CompareTargetPicker({
  capture,
  referenceLabel,
  rule,
  onRuleChange,
  targets,
  onTargetsWanted,
  now,
  className,
}: CompareWithProps & {
  capture: Pick<ReviewCaptureView, 'id' | 'baseline' | 'previous'>;
  /** The reference on show, as its caption reads (`Approved (#470)`); `null` when there is none. */
  referenceLabel: string | null;
  className?: string;
}) {
  const others = (targets ?? []).filter((t) => t.captureId !== capture.id);
  const commented = others.filter((t) => t.openThreads > 0);
  const rest = others.filter((t) => t.openThreads === 0);
  const loading = targets === undefined;
  const runItem = (t: CompareTargetView) => (
    <SelectItem key={t.captureId} value={`run:${t.runNumber}`} className="text-label-s">
      <span className="flex min-w-0 flex-col">
        <span className="tabular-nums">Run #{t.runNumber}</span>
        {t.branch || t.at ? (
          <span className="max-w-56 truncate text-body-xs text-muted-foreground">
            {[t.branch, t.at ? formatRelative(t.at, { now }) : null].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </span>
      <span className={hint}>
        {t.openThreads > 0 ? (
          <span className="inline-flex items-center gap-1">
            <MessageSquare aria-hidden className="size-3" />
            {t.openThreads} open
          </span>
        ) : t.same ? (
          'Identical'
        ) : null}
      </span>
    </SelectItem>
  );

  return (
    <Select value={rule} onValueChange={(next) => next && onRuleChange(parseCompareRule(String(next)))} onOpenChange={(open) => open && onTargetsWanted?.()}>
      <SelectTrigger
        size="sm"
        className={cn('max-w-60 text-label-s', className)}
        aria-label="Compare with"
        title="What this image is compared with"
        onPointerEnter={onTargetsWanted}
        onFocus={onTargetsWanted}
      >
        <GitCompareArrows aria-hidden className="text-muted-foreground" />
        <span className="truncate">
          <span className="text-muted-foreground">vs. </span>
          {referenceLabel ?? 'Nothing yet'}
        </span>
      </SelectTrigger>
      <SelectContent align="start" className="w-auto min-w-64">
        <SelectGroup>
          <SelectItem value="auto" className="text-label-s">
            <span>{COMPARE_RULE_LABELS.auto}</span>
            <span className={hint}>baseline, else run before</span>
          </SelectItem>
          <SelectItem value="baseline" disabled={!capture.baseline} className="text-label-s">
            <span>{COMPARE_RULE_LABELS.baseline}</span>
            <span className={hint}>{capture.baseline ? (capture.baseline.runNumber ? `#${capture.baseline.runNumber}` : 'approved') : 'none yet'}</span>
          </SelectItem>
          <SelectItem value="previous" disabled={!capture.previous} className="text-label-s">
            <span>{COMPARE_RULE_LABELS.previous}</span>
            <span className={hint}>{capture.previous ? `#${capture.previous.runNumber}` : 'none'}</span>
          </SelectItem>
          <SelectItem value="comments" disabled={!loading && commented.length === 0} className="text-label-s">
            <span>{COMPARE_RULE_LABELS.comments}</span>
            <span className={hint}>{loading ? <Skeleton aria-hidden className="ms-auto h-3 w-8" /> : commented[0] ? `#${commented[0].runNumber}` : 'none open'}</span>
          </SelectItem>
        </SelectGroup>
        {loading ? (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Other runs</SelectLabel>
              {/* A listbox holds only options: the placeholders are disabled ones, named for a screen reader. */}
              {[0, 1, 2].map((i) => (
                <SelectItem key={i} value={`__loading:${i}`} disabled aria-label="Loading the other runs…" className="text-label-s data-disabled:opacity-100">
                  <span aria-hidden className="flex flex-col gap-1.5 py-0.5">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3 w-44" />
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        ) : null}
        {commented.length ? (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Open comments</SelectLabel>
              {commented.map(runItem)}
            </SelectGroup>
          </>
        ) : null}
        {rest.length ? (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Other runs</SelectLabel>
              {rest.map(runItem)}
            </SelectGroup>
          </>
        ) : null}
        {!loading && others.length === 0 ? (
          <>
            <SelectSeparator />
            <SelectItem value="__none" disabled className="text-body-xs text-muted-foreground">
              No other run still has an image of this screen.
            </SelectItem>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}
