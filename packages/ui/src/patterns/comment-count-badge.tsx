import { MessageSquare, RefreshCw } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * How many open comment threads a screen has, as a small speech bubble in
 * its corner. Nothing when there are none. The number changes with a tick.
 *
 * `outdated` of them were made on an earlier version of the screen: when all
 * of them were, the bubble turns to the "ready to verify" look (an outline
 * and a refresh mark) — the screen changed since, and a reviewer should look.
 */
export function CommentCountBadge({ count, outdated = 0, className }: { count: number; outdated?: number; className?: string }) {
  if (count <= 0) return null;
  const allOutdated = outdated >= count;
  const label = `${count} open ${count === 1 ? 'comment' : 'comments'}${outdated ? `, ${allOutdated && count > 1 ? 'all' : outdated} on an earlier version` : ''}`;
  return (
    <span
      key={`${count}:${outdated}`}
      data-slot="comment-count-badge"
      title={label}
      className={cn(
        'pointer-events-none absolute top-1.5 right-1.5 z-10 inline-flex h-5 animate-pin-drop items-center gap-1 rounded-full rounded-bl-[3px] px-1.5 text-label-xs tabular-nums shadow-e2 ring-2',
        allOutdated ? 'bg-surface text-info-text ring-info-border' : 'bg-accent-solid text-accent-on-solid ring-surface',
        className,
      )}
    >
      {allOutdated ? <RefreshCw aria-hidden className="size-3" /> : <MessageSquare aria-hidden className="size-3" />}
      <span aria-hidden>{count}</span>
      {outdated && !allOutdated ? <RefreshCw aria-hidden className="size-3 opacity-80" /> : null}
      <span className="sr-only">{label}</span>
    </span>
  );
}
