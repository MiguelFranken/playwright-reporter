'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { latest, sameSearch, settle, type PendingTarget } from '@/lib/filters/pending-queue';

/**
 * The query a filter has asked for but the router has not committed yet.
 *
 * A filter navigates inside a transition, and `useSearchParams` only moves
 * once the server has answered. Reading it alone, a checkbox ticks — and the
 * results change — a round trip after the click, which is what a slow
 * interaction looks like. So every filter writes its target here the moment it
 * is clicked: the controls show the target straight away, and the results
 * swap to their skeleton in the same frame.
 *
 * Targets queue, because a second click can land before the first commits;
 * each builds on the one before, so two quick ticks add up. When the committed
 * query reaches a target, it and every earlier one are spent. When it moves
 * somewhere no target led (a link, the back button), they all are.
 */
type Target = PendingTarget;

let targets: readonly Target[] = [];
/** The committed query last looked at, so a control mounting mid-flight does not spend the queue. */
let seen = '';
const listeners = new Set<() => void>();

function emit(next: readonly Target[]) {
  targets = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const snapshot = () => targets;
const serverSnapshot = (): readonly Target[] => [];

/** Records a navigation the caller is about to start. */
export function pushPendingSearch(pathname: string, search: string) {
  emit([...targets, { pathname, search }]);
}

/**
 * The query as it will be once in-flight filter changes land, and whether any
 * are in flight — for this route only.
 */
export function usePendingSearch() {
  const committed = useSearchParams();
  const pathname = usePathname();
  const queue = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const committedSearch = committed.toString();

  useEffect(() => {
    const key = `${pathname}?${committedSearch}`;
    if (key === seen) return;
    seen = key;
    if (targets.length) emit(settle(targets, pathname, committedSearch));
  }, [pathname, committedSearch]);

  const target = latest(queue, pathname);
  const params = useMemo(() => (target ? new URLSearchParams(target.search) : new URLSearchParams(committedSearch)), [target, committedSearch]);
  return { params, pending: target !== undefined && !sameSearch(target.search, committedSearch), committed };
}
