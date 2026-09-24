'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/button';
import { Input } from '../components/input';
import { SegmentedControl } from '../components/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/select';
import { Skeleton } from '../components/skeleton';
import { cn } from '../lib/cn';

/**
 * The controlled halves of the filter bar. Each one takes a value and reports a
 * change; none of them reads or writes a URL. The app wraps each in a three-line
 * `Url*` component that binds it to `useSearchParams`, which is where all the
 * routing coupling now lives.
 *
 * `isPending` exists so a control can show that a transition is in flight
 * without owning the transition.
 */

export interface RangeToggleProps {
  value: string;
  onValueChange: (next: string | null) => void;
  options?: number[];
  /** Adds a leading "All" segment that clears the range entirely. */
  allowAll?: boolean;
  isPending?: boolean;
  className?: string;
}

export function RangeToggle({
  value,
  onValueChange,
  options = [7, 30, 90],
  allowAll = false,
  isPending,
  className,
}: RangeToggleProps) {
  const items = [
    ...(allowAll ? [{ value: 'all', label: 'All', 'aria-label': 'All time' }] : []),
    ...options.map((o) => ({ value: String(o), label: `${o}d`, 'aria-label': `Last ${o} days` })),
  ];
  return (
    <SegmentedControl
      aria-label="Time range"
      className={cn(isPending && 'opacity-60', className)}
      value={value}
      items={items}
      onValueChange={(next) => onValueChange(next === 'all' ? null : next)}
    />
  );
}

export function RangeToggleSkeleton({ segments = 3 }: { segments?: number }) {
  return <Skeleton className="h-9 rounded-[10px]" style={{ width: segments * 42 + 4 }} />;
}

export interface FilterSelectProps {
  value: string;
  onValueChange: (next: string | null) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  /** Label of the option that clears the filter. */
  allLabel?: string;
  isPending?: boolean;
  className?: string;
}

export function FilterSelect({
  value,
  onValueChange,
  options,
  placeholder,
  allLabel = 'All',
  isPending,
  className,
}: FilterSelectProps) {
  const items = [{ value: 'all', label: allLabel }, ...options];
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(next === 'all' || next === null ? null : String(next))}
    >
      <SelectTrigger className={cn('min-w-40', isPending && 'opacity-60', className)} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterSelectSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-9 min-w-40 rounded-lg', className)} />;
}

export interface SearchFieldProps {
  /** The committed value — what the host currently filters by. */
  value: string;
  /** Fired on submit and on clear, not on every keystroke. */
  onValueChange: (next: string | null) => void;
  placeholder?: string;
  isPending?: boolean;
  /**
   * Takes the width it is given instead of settling at 18rem from `sm` up.
   * For a column narrower than that — the specs sidebar — where the default
   * would push whatever sits beside it out of the container.
   */
  fill?: boolean;
  className?: string;
}

/**
 * Holds the in-progress text itself and only reports on submit, so a host bound
 * to the URL does not push a history entry per character. It re-syncs whenever
 * the committed value changes underneath it (back button, cleared filters).
 */
export function SearchField({
  value,
  onValueChange,
  placeholder = 'Search…',
  isPending,
  fill,
  className,
}: SearchFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <form
      className={cn('relative flex items-center', isPending && 'opacity-60', className)}
      onSubmit={(e) => {
        e.preventDefault();
        onValueChange(draft.trim() || null);
      }}
    >
      <Search className="pointer-events-none absolute start-3 size-4 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn('w-full ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden', !fill && 'sm:w-72')}
      />
      {draft ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-static
          className="absolute end-1 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
          onClick={() => {
            setDraft('');
            onValueChange(null);
          }}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </form>
  );
}

export function SearchFieldSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-9 w-full rounded-lg sm:w-72', className)} />;
}
