'use client';

import { GitCompareArrows, LoaderCircle } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import { COMPARE_RULE_LABELS, compareRuleRun, parseCompareRule, type CompareRule, type RunCompareTargetView } from '../../lib/review';

/** What the run review's "Compare with" reads and records; the host fetches the other runs and owns the rule. */
export interface RunCompareProps {
  rule: CompareRule;
  onRuleChange: (next: CompareRule) => void;
  /** The other runs that captured any of the run's screens, newest first; `undefined` until they have loaded. */
  targets?: readonly RunCompareTargetView[] | null;
  /** The reviewer is about to look at the list: the host loads the other runs only then. */
  onTargetsWanted?: () => void;
  /** The review under the new rule is on its way; the screens still show the one before. */
  pending?: boolean;
  /** The reference instant for relative times (stories pin it). */
  now?: Date;
}

const hint = 'ms-auto ps-4 text-end text-body-xs text-muted-foreground tabular-nums';

function ruleLabel(rule: CompareRule) {
  const run = compareRuleRun(rule);
  return run !== null ? `Run #${run}` : COMPARE_RULE_LABELS[rule as keyof typeof COMPARE_RULE_LABELS];
}

/**
 * Chooses what a whole run's review is compared with: each screen's approved
 * baseline (else the run before, the default), the run before it, or one
 * particular run — to see what a change did to every screen at once. The
 * screens' measured changes, and the order "most changed first" puts them in,
 * follow the choice; a screen the chosen run did not capture keeps its
 * default comparison.
 */
export function RunComparePicker({ rule, onRuleChange, targets, onTargetsWanted, pending = false, now, className }: RunCompareProps & { className?: string }) {
  const loading = targets === undefined;
  const runs = targets ?? [];
  const chosenRun = compareRuleRun(rule);
  // A run older than the list (a shared link) still shows as chosen.
  const chosenMissing = chosenRun !== null && !loading && !runs.some((t) => t.runNumber === chosenRun);
  // Rules that pick per image, chosen in the viewer, show here as they are.
  const perImage = rule === 'baseline' || rule === 'comments';

  return (
    <Select value={rule} onValueChange={(next) => next && onRuleChange(parseCompareRule(String(next)))} onOpenChange={(open) => open && onTargetsWanted?.()}>
      <SelectTrigger
        size="sm"
        className={cn('max-w-64 text-label-s', className)}
        aria-label="Compare the run with"
        aria-busy={pending || undefined}
        title="What every screen of this run is compared with"
        onPointerEnter={onTargetsWanted}
        onFocus={onTargetsWanted}
      >
        {pending ? <LoaderCircle aria-hidden className="animate-spin text-muted-foreground" /> : <GitCompareArrows aria-hidden className="text-muted-foreground" />}
        <span className="truncate">
          <span className="text-muted-foreground">vs. </span>
          {ruleLabel(rule)}
        </span>
      </SelectTrigger>
      <SelectContent align="start" className="w-auto min-w-72">
        <SelectGroup>
          <SelectItem value="auto" className="text-label-s">
            <span>{COMPARE_RULE_LABELS.auto}</span>
            <span className={hint}>baseline, else run before</span>
          </SelectItem>
          <SelectItem value="previous" className="text-label-s">
            <span>{COMPARE_RULE_LABELS.previous}</span>
            <span className={hint}>per screen</span>
          </SelectItem>
          {perImage ? (
            <SelectItem value={rule} className="text-label-s">
              <span>{COMPARE_RULE_LABELS[rule]}</span>
              <span className={hint}>per image</span>
            </SelectItem>
          ) : null}
          {chosenMissing ? (
            <SelectItem value={rule} className="text-label-s">
              <span className="tabular-nums">Run #{chosenRun}</span>
            </SelectItem>
          ) : null}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Other runs</SelectLabel>
          {loading
            ? // A listbox holds only options: the placeholders are disabled ones, named for a screen reader.
              [0, 1, 2].map((i) => (
                <SelectItem key={i} value={`__loading:${i}`} disabled aria-label="Loading the other runs…" className="text-label-s data-disabled:opacity-100">
                  <span aria-hidden className="flex flex-col gap-1.5 py-0.5">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3 w-44" />
                  </span>
                </SelectItem>
              ))
            : runs.map((t) => (
                <SelectItem key={t.runNumber} value={`run:${t.runNumber}`} className="text-label-s">
                  <span className="flex min-w-0 flex-col">
                    <span className="tabular-nums">Run #{t.runNumber}</span>
                    {t.branch || t.sha || t.at ? (
                      <span className="max-w-60 truncate text-body-xs text-muted-foreground">
                        {[t.branch, t.sha, t.at ? formatRelative(t.at, { now }) : null].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  <span className={hint}>
                    {t.screens} {t.screens === 1 ? 'screen' : 'screens'}
                  </span>
                </SelectItem>
              ))}
          {!loading && runs.length === 0 ? (
            <SelectItem value="__none" disabled className="text-body-xs text-muted-foreground">
              No other run still has images of these screens.
            </SelectItem>
          ) : null}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
