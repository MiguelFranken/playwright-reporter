'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, useTransition } from 'react';
import { pushPendingSearch, usePendingSearch } from './pending-search';
import {
  FilterMultiSelect,
  FilterSelect,
  FilterSelectSkeleton,
  RangeToggle,
  RangeToggleSkeleton,
  SearchField,
  SearchFieldSkeleton,
  type FilterMultiSelectProps,
  type FilterSelectProps,
  type RangeToggleProps,
  type SearchFieldProps,
} from '@miguelfranken/ui/patterns/filter-controls';

/**
 * Updates one or more search params on the current route (resetting `page`).
 *
 * `params` is the query as the last change asked for it, not as the router has
 * committed it (see `pending-search.ts`): a control shows its new value on the
 * click, and a second change builds on the first even while it is in flight.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const { params } = usePendingSearch();
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
      pushPendingSearch(pathname, qs);
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );
  return { params, set, isPending };
}

/**
 * Updates search params *without a navigation*, for views that already hold
 * the data every value of those params selects (the run page's tabs, outcome
 * filter and spec files, backed by TanStack Query).
 *
 * `history.replaceState` is integrated with the App Router: `useSearchParams`
 * follows it, the server is not asked for anything and nothing suspends, so
 * no placeholder flashes. A reload or a shared link still renders the same
 * state on the server, because the server reads the same params.
 *
 * Each change starts from the address bar as it is now rather than from the
 * last render's params, so two quick changes cannot undo each other.
 */
export function useShallowSearch() {
  const params = useSearchParams();
  const pathname = usePathname();
  const set = useCallback(
    (updates: Record<string, string | string[] | null | undefined>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(updates)) {
        next.delete(k);
        if (Array.isArray(v)) v.filter(Boolean).forEach((x) => next.append(k, x));
        else if (v) next.set(k, v);
      }
      next.delete('page');
      const qs = next.toString();
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname],
  );
  return { params, set };
}

/**
 * Each control below is the connected half of a controlled component in
 * `@miguelfranken/ui/patterns/filter-controls`: it reads the query string, hands the
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
  const { params, set } = useUrlParams();
  const current = params.get(param);
  const value = current ?? (rest.allowAll ? 'all' : String(fallback));
  return (
    <RangeToggle
      {...rest}
      value={value}
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
  const { params, set } = useUrlParams();
  return (
    <FilterSelect
      {...rest}
      value={params.get(param) ?? 'all'}
      onValueChange={(next) => set({ [param]: next })}
    />
  );
}

type UrlMultiSelectProps = Omit<FilterMultiSelectProps, 'value' | 'onValueChange' | 'isPending'> & { param: string };

/** A filter that takes several values, as the param repeated: `?priority=critical&priority=high`. */
export function UrlMultiSelect(props: UrlMultiSelectProps) {
  return (
    <Suspense fallback={<FilterSelectSkeleton className={props.className} />}>
      <UrlMultiSelectInner {...props} />
    </Suspense>
  );
}

function UrlMultiSelectInner({ param, ...rest }: UrlMultiSelectProps) {
  const { params, set } = useUrlParams();
  return <FilterMultiSelect {...rest} value={params.getAll(param)} onValueChange={(next) => set({ [param]: next })} />;
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
  const { params, set } = useUrlParams();
  return (
    <SearchField
      {...rest}
      value={params.get(param) ?? ''}
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
