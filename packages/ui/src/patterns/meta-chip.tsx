import { cn } from '../lib/cn';

/**
 * A small, low-contrast fact attached to a row — the browser it ran on, how
 * long it took, which shard. Deliberately quieter than `Badge`: a badge states
 * a *status* and earns colour, a chip only carries a detail, so a row can hold
 * five of them without turning into a traffic light.
 */
export function MetaChip({
  icon: Icon,
  children,
  title,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-border bg-surface-sunken px-1.5 text-label-xs text-muted-foreground',
        className,
      )}
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
