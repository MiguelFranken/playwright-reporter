'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useOptimistic, useState, useTransition } from 'react';
import {
  FilterSelect,
  FilterSelectSkeleton,
  RangeToggle,
  RangeToggleSkeleton,
  SearchField,
  SearchFieldSkeleton,
  type FilterSelectProps,
  type RangeToggleProps,
  type SearchFieldProps,
} from '@repo/ui/patterns/filter-controls';

/** Updates one or more search params on the current route (resetting `page`). */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const set = useCallback(
    (updates: Record<string, string | string[] | null | undefined>, opts: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        next.delete(k);
        if (Array.isArray(v)) v.filter(Boolean).forEach((x) => next.append(k, x));
        else if (v) next.set(k, v);
      }
      if (!opts.keepPage) next.delete('page');
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );
  return { params, set, isPending };
}

/**
 * A tab strip whose selection lives in the URL, switched optimistically.
 *
 * The plain `set` above keeps the old UI on screen for the whole round trip:
 * React holds the previous render until the new one is ready, so the strip goes
 * on pointing at the tab you just left. That reads as a dropped click.
 *
 * So the selection is moved at once with `useOptimistic` and the caller is told
 * it is `switching`, which is its cue to show a placeholder in the body. When
 * the server answers, `value` changes underneath and the optimistic state
 * folds back into it — including when the navigation fails or the user goes
 * back, which is the reason for using `useOptimistic` rather than holding the
 * pending tab in `useState` and having to unwind it by hand.
 *
 * The optimistic write has to happen *inside* the transition that navigates,
 * so this owns its own transition rather than reusing `useUrlParams`.
 */
export function useUrlTab<T extends string>(
  param: string,
  value: T,
  options: {
    /** The value that is spelled by *omitting* the param, e.g. "summary". */
    defaultValue?: T;
    /** Params cleared on a switch — a filter from the old tab rarely fits the new one. */
    resets?: string[];
  } = {},
) {
  const { defaultValue, resets } = options;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  // Joined so the callback is not rebuilt for an array that is spelled fresh on
  // every render but never actually changes.
  const resetKey = resets?.join(',') ?? '';

  const select = useCallback(
    (next: T) => {
      if (next === value) return;
      startTransition(() => {
        setOptimistic(next);
        const qs = new URLSearchParams(params.toString());
        for (const key of resetKey ? resetKey.split(',') : []) qs.delete(key);
        qs.delete('page');
        if (next === defaultValue) qs.delete(param);
        else qs.set(param, next);
        const search = qs.toString();
        router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
      });
    },
    [defaultValue, param, params, pathname, resetKey, router, setOptimistic, value],
  );

  return {
    /** What the strip should show as active — the target, not the committed value. */
    tab: optimistic,
    select,
    isPending,
    /** True while the body on screen still belongs to the previous tab. */
    switching: optimistic !== value,
  };
}

/**
 * Each control below is the connected half of a controlled component in
 * `@repo/ui/patterns/filter-controls`: it reads the query string, hands the
 * value down and writes the change back. Nothing else in the app knows the
 * filters live in the URL.
 *
 * Reading the query string is dynamic, and an unguarded read would block the
 * prerender of everything above it. Each control therefore owns its Suspense
 * boundary and renders a same-sized placeholder, so pages can drop them into an
 * otherwise static shell without thinking about it.
 */

type UrlRangeToggleProps = Omit<RangeToggleProps, 'value' | 'onValueChange' | 'isPending'> & {
  param?: string;
  fallback?: number;
};

/**
 * Exported as `RangeToggle` as well: the call sites name the control, not the
 * fact that it happens to be bound to the URL.
 */
export function UrlRangeToggle(props: UrlRangeToggleProps) {
  const segments = (props.options?.length ?? 3) + (props.allowAll ? 1 : 0);
  return (
    <Suspense fallback={<RangeToggleSkeleton segments={segments} />}>
      <UrlRangeToggleInner {...props} />
    </Suspense>
  );
}

function UrlRangeToggleInner({ param = 'range', fallback = 30, ...rest }: UrlRangeToggleProps) {
  const { params, set, isPending } = useUrlParams();
  const current = params.get(param);
  const value = current ?? (rest.allowAll ? 'all' : String(fallback));
  return (
    <RangeToggle
      {...rest}
      value={value}
      isPending={isPending}
      onValueChange={(next) => set({ [param]: next })}
    />
  );
}

type UrlSelectProps = Omit<FilterSelectProps, 'value' | 'onValueChange' | 'isPending'> & { param: string };

export function UrlSelect(props: UrlSelectProps) {
  return (
    <Suspense fallback={<FilterSelectSkeleton className={props.className} />}>
      <UrlSelectInner {...props} />
    </Suspense>
  );
}

function UrlSelectInner({ param, ...rest }: UrlSelectProps) {
  const { params, set, isPending } = useUrlParams();
  return (
    <FilterSelect
      {...rest}
      value={params.get(param) ?? 'all'}
      isPending={isPending}
      onValueChange={(next) => set({ [param]: next })}
    />
  );
}

type UrlSearchProps = Omit<SearchFieldProps, 'value' | 'onValueChange' | 'isPending'> & { param?: string };

export function UrlSearch(props: UrlSearchProps) {
  return (
    <Suspense fallback={<SearchFieldSkeleton className={props.className} />}>
      <UrlSearchInner {...props} />
    </Suspense>
  );
}

function UrlSearchInner({ param = 'q', ...rest }: UrlSearchProps) {
  const { params, set, isPending } = useUrlParams();
  return (
    <SearchField
      {...rest}
      value={params.get(param) ?? ''}
      isPending={isPending}
      onValueChange={(next) => set({ [param]: next })}
    />
  );
}

export { UrlRangeToggle as RangeToggle };

/**
 * Optimistic selection for a strip made of links.
 *
 * `useUrlTab` above owns the navigation, so it can put the optimistic write
 * inside it. A link strip cannot: Next owns that transition, and it has to keep
 * owning it — an intercepted anchor loses middle-click, cmd-click and "open in
 * new tab". So the pending choice is held here instead and dropped the moment
 * the committed value catches up, which is the same moment the new body
 * arrives.
 *
 * Only a plain left click is recorded. A modified click opens elsewhere and
 * never changes this page, so treating it as a selection would leave the strip
 * pointing at a tab the reader never went to.
 */
export function usePendingSelection<T extends string>(committed: T) {
  const [pending, setPending] = useState<T | null>(null);
  // The committed value is the server's answer; once it agrees, the guess is spent.
  useEffect(() => setPending(null), [committed]);

  const onSelect = useCallback((next: T, event?: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }) => {
    if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    setPending(next);
  }, []);

  return { selected: pending ?? committed, pending: pending !== null && pending !== committed, onSelect };
}
