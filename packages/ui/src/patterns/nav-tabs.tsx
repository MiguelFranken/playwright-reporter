import { Link } from '../provider';
import { cn } from '../lib/cn';

export interface NavTabItem {
  href: string;
  label: string;
}

/** A click that navigates this page, as opposed to opening somewhere else. */
export interface NavTabClick {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}

/**
 * An underlined tab strip made of links. Which one is current is decided by the
 * host — the app reads `usePathname`, a story passes a literal — so this stays
 * free of any router.
 *
 * These stay real links: intercepting the click to route by hand would cost
 * middle-click, cmd-click and "open in new tab". `onSelect` only *reports* the
 * click, so a host that wants the strip to move before the next page arrives
 * can mark it itself.
 */
export function NavTabs({
  items,
  activeHref,
  label = 'Sections',
  className,
  onSelect,
}: {
  items: NavTabItem[];
  activeHref?: string;
  /** Accessible name for the nav landmark. */
  label?: string;
  className?: string;
  /** Reports the clicked href; the host decides whether to pre-mark it. */
  onSelect?: (href: string, event: NavTabClick) => void;
}) {
  return (
    <nav className={cn('flex gap-1 border-b border-separator', className)} aria-label={label}>
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(event) => onSelect?.(item.href, event)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2.5 text-label-m transition-colors duration-150',
              active
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Same height as the strip, so the page does not shift when it resolves. */
export function NavTabsSkeleton() {
  return <div className="h-11 border-b border-separator" aria-hidden />;
}
