import { CheckCircle2, Diff, MessageSquareWarning, Sparkles } from 'lucide-react';
import { Badge } from '../components/badge';
import { cn } from '../lib/cn';
import { REVIEW_STATUS_LABELS, REVIEW_STATUS_TONES, type ReviewStatus } from '../lib/review';
import { toneBadge, toneSolid } from '../lib/tone';

const ICONS: Record<ReviewStatus, React.ComponentType<{ className?: string }>> = {
  approved: CheckCircle2,
  changes_requested: MessageSquareWarning,
  changed: Diff,
  new: Sparkles,
};

/** A review image's status: label, icon and tone, so colour is never the only carrier. */
export function ReviewStatusBadge({ status, className, label }: { status: ReviewStatus; className?: string; label?: string }) {
  const Icon = ICONS[status];
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', toneBadge[REVIEW_STATUS_TONES[status]], className)}>
      <Icon className="size-3" />
      {label ?? REVIEW_STATUS_LABELS[status]}
    </Badge>
  );
}

/** The status as a small dot with an accessible name, for dense strips. */
export function ReviewStatusDot({ status, className }: { status: ReviewStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={REVIEW_STATUS_LABELS[status]}
      title={REVIEW_STATUS_LABELS[status]}
      className={cn('inline-block size-2 shrink-0 rounded-full', toneSolid[REVIEW_STATUS_TONES[status]], className)}
    />
  );
}
