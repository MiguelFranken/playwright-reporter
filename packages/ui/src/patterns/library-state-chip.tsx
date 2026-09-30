import { CheckCircle2, Diff, Eye, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { Badge } from '../components/badge';
import { cn } from '../lib/cn';
import { LIBRARY_STATE_HINTS, LIBRARY_STATE_LABELS, LIBRARY_STATE_TONES, type LibraryState } from '../lib/library-views';
import { toneBadge, toneText } from '../lib/tone';

export const LIBRARY_STATE_ICONS: Record<LibraryState, React.ComponentType<{ className?: string }>> = {
  waiting: MessageSquareWarning,
  verify: RefreshCw,
  'needs-review': Eye,
  updated: Diff,
  approved: CheckCircle2,
};

/**
 * Where a screen or flow stands in the review loop: label, icon and tone, so
 * colour is never the only carrier. `iconOnly` keeps the icon, with the label
 * as its accessible name, for section headings and dense lists.
 */
export function LibraryStateChip({ state, iconOnly = false, className, count }: { state: LibraryState; iconOnly?: boolean; className?: string; count?: number }) {
  const Icon = LIBRARY_STATE_ICONS[state];
  const tone = LIBRARY_STATE_TONES[state];
  if (iconOnly) {
    return (
      <span role="img" aria-label={LIBRARY_STATE_LABELS[state]} title={LIBRARY_STATE_HINTS[state]} className={cn('inline-flex shrink-0', toneText[tone], className)}>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Badge variant="outline" title={LIBRARY_STATE_HINTS[state]} className={cn('gap-1 border-transparent font-medium', toneBadge[tone], className)}>
      <Icon className="size-3" />
      {LIBRARY_STATE_LABELS[state]}
      {count != null ? <span className="tabular-nums">{count}</span> : null}
    </Badge>
  );
}
