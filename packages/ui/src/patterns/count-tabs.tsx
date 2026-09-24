import { Link } from '../provider';
import { cn } from '../lib/cn';
import type { NavTabClick } from './nav-tabs';
import { toneSolid, type Tone } from '../lib/tone';

/**
 * A pill strip where every option carries its own count — "All 5 · Passed 2 ·
 * Failed 2". The count is the point: it tells you whether a filter is worth
 * taking before you take it, and a zero option stays in place rather than
 * disappearing, so the strip does not reflow as a run fills in.
 *
 * Links, not buttons, because the selection lives in the URL. `aria-current`
 * marks the active one; `aria-pressed` would be wrong on a link. `onSelect`
 * only reports the click — the link still does the navigating — so a host can
 * move the strip before the filtered rows come back.
 *
 * An empty option is left at full contrast rather than dimmed — its own `0` is
 * the signal, and fading the label only costs legibility (the a11y run in
 * Storybook catches the contrast loss).
 */

export interface CountTabItem {
  value: string;
  label: string;
  count?: number;
  tone?: Tone;
  href: string;
}

export function CountTabs({
  items,
  value,
  className,
  label = 'Filter by outcome',
  onSelect,
}: {
  items: CountTabItem[];
  /** The active item's `value`. */
  value: string;
  className?: string;
  label?: string;
  /** Reports the clicked value; the host decides whether to pre-mark it. */
  onSelect?: (value: string, event: NavTabClick) => void;
}) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-sunken p-1', className)}
      role="group"
      aria-label={label}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Link
            key={item.value}
            href={item.href}
            onClick={(event) => onSelect?.(item.value, event)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-label-s transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
              active
                ? 'bg-surface text-foreground shadow-e1'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.tone ? <span className={cn('size-1.5 rounded-full', toneSolid[item.tone])} aria-hidden /> : null}
            {item.label}
            {item.count === undefined ? null : (
              <span className="tabular-nums text-muted-foreground">{item.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
