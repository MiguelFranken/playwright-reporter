import { MessageSquare } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * How many open comment threads a screen has, as a small speech bubble in
 * its corner. Nothing when there are none. The number changes with a tick.
 */
export function CommentCountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  const label = `${count} open ${count === 1 ? 'comment' : 'comments'}`;
  return (
    <span
      key={count}
      data-slot="comment-count-badge"
      title={label}
      className={cn(
        'pointer-events-none absolute top-1.5 right-1.5 z-10 inline-flex h-5 animate-pin-drop items-center gap-1 rounded-full rounded-bl-[3px] bg-accent-solid px-1.5 text-label-xs text-accent-on-solid tabular-nums shadow-e2 ring-2 ring-surface',
        className,
      )}
    >
      <MessageSquare aria-hidden className="size-3" />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
