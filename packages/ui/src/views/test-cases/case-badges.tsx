import {
  BellOff,
  Bot,
  CheckCircle2,
  ChevronsUp,
  CircleDashed,
  Clock3,
  Equal,
  Hand,
  Hourglass,
  Minus,
  Repeat2,
  ChevronDown,
  ChevronUp,
  ShieldQuestion,
  XCircle,
} from 'lucide-react';
import { Badge } from '../../components/badge';
import { cn } from '../../lib/cn';
import {
  CASE_AUTOMATION_LABELS,
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  CASE_VERDICT_LABELS,
  type CaseAutomation,
  type CasePriority,
  type CaseStatus,
  type CaseVerdict,
} from '../../lib/test-cases';
import { toneBadge, toneText, type Tone } from '../../lib/tone';

const STATUS_TONE: Record<CaseStatus, Tone> = { active: 'success', draft: 'info', deprecated: 'neutral' };

export function CaseStatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('text-eyebrow', toneBadge[STATUS_TONE[status]], className)}>
      {CASE_STATUS_LABELS[status]}
    </Badge>
  );
}

const PRIORITY_ICON: Record<CasePriority, React.ComponentType<{ className?: string }>> = {
  critical: ChevronsUp,
  high: ChevronUp,
  medium: Equal,
  low: ChevronDown,
  none: Minus,
};
const PRIORITY_TONE: Record<CasePriority, string> = {
  critical: toneText.danger,
  high: toneText.warning,
  medium: toneText.info,
  low: toneText.neutral,
  none: 'text-muted-foreground/60',
};

/** The priority as a glyph for dense rows; the label is its accessible name. */
export function PriorityIcon({ priority, className }: { priority: CasePriority; className?: string }) {
  const Icon = PRIORITY_ICON[priority];
  const label = `Priority: ${CASE_PRIORITY_LABELS[priority]}`;
  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex', PRIORITY_TONE[priority], className)}>
      <Icon className="size-4" />
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: CasePriority }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn('size-4', PRIORITY_TONE[priority])} aria-hidden />
      {CASE_PRIORITY_LABELS[priority]}
    </span>
  );
}

/**
 * Manual, to be automated, or automated. "Automated" without a linked test
 * reads as unverified: nothing proves it.
 */
export function AutomationBadge({
  automation,
  linkCount,
  compact = false,
  className,
}: {
  automation: CaseAutomation;
  linkCount: number;
  compact?: boolean;
  className?: string;
}) {
  const unverified = automation === 'automated' && linkCount === 0;
  const Icon = unverified ? ShieldQuestion : automation === 'automated' ? Bot : automation === 'planned' ? Hourglass : Hand;
  const label = unverified ? 'Automated (unverified)' : CASE_AUTOMATION_LABELS[automation];
  const tone: Tone = unverified ? 'warning' : automation === 'automated' ? 'info' : 'neutral';
  const title = unverified ? 'Marked automated, but no Playwright test is linked to it.' : label;
  if (compact) {
    return (
      <span role="img" aria-label={label} title={title} className={cn('inline-flex', toneText[tone], className)}>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Badge variant="outline" title={title} className={cn('gap-1.5', toneBadge[tone], className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </Badge>
  );
}

const VERDICT_TONE: Record<CaseVerdict, Tone> = {
  passing: 'success',
  failing: 'danger',
  flaky: 'warning',
  stale: 'warning',
  not_run: 'neutral',
  none: 'neutral',
};
const VERDICT_ICON: Record<CaseVerdict, React.ComponentType<{ className?: string }>> = {
  passing: CheckCircle2,
  failing: XCircle,
  flaky: Repeat2,
  stale: Clock3,
  not_run: CircleDashed,
  none: Minus,
};
const VERDICT_HINT: Record<CaseVerdict, string> = {
  passing: 'Every linked test passed its latest run.',
  failing: 'A linked test failed its latest run.',
  flaky: 'A linked test needed retries in the last 30 days.',
  stale: 'No linked test ran in the last 14 days.',
  not_run: 'The linked tests have not run yet.',
  none: 'No Playwright test is linked to this case.',
};

/** What the linked tests' runs say about the case. */
export function VerdictBadge({ verdict, compact = false, className }: { verdict: CaseVerdict; compact?: boolean; className?: string }) {
  const Icon = VERDICT_ICON[verdict];
  const tone = VERDICT_TONE[verdict];
  if (compact) {
    return (
      <span role="img" aria-label={CASE_VERDICT_LABELS[verdict]} title={VERDICT_HINT[verdict]} className={cn('inline-flex', toneText[tone], className)}>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Badge variant="outline" title={VERDICT_HINT[verdict]} className={cn('gap-1.5', toneBadge[tone], className)}>
      <Icon className="size-3" aria-hidden />
      {CASE_VERDICT_LABELS[verdict]}
    </Badge>
  );
}

export function MutedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1', toneBadge.neutral, className)} title="Muted: its results do not count.">
      <BellOff className="size-3" aria-hidden />
      Muted
    </Badge>
  );
}

export { VERDICT_HINT };
