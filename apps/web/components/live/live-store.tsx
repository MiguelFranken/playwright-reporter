'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LiveIndicator, type LiveState } from '@miguelfranken/ui/patterns/live-indicator';
import { LIVE_EVENT_TYPES, type LiveEvent } from '@/lib/live/events';
import { LiveStore, type Reducer } from '@/lib/live/store';

const LiveStoreContext = createContext<LiveStore | null>(null);

/** One store per page: every live view on it reads from the same stream. */
export function LiveStoreProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => new LiveStore());
  return <LiveStoreContext.Provider value={store}>{children}</LiveStoreContext.Provider>;
}

export function useLiveStore() {
  const store = useContext(LiveStoreContext);
  if (!store) throw new Error('useLiveStore needs a <LiveStoreProvider>');
  return store;
}

function useStoreVersion(store: LiveStore) {
  return useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
}

/**
 * A view's data, kept current by the stream. The server-rendered `value` is
 * shown until the store has taken it over, and whenever the server sends a
 * newer one (a navigation, a filter change) it replaces the live copy.
 */
export function useLivePart<T>(name: string, value: T, cursor: number, reduce: Reducer<T>, source: unknown = value): T {
  const store = useLiveStore();
  useStoreVersion(store);
  useEffect(() => {
    store.hydrate(name, source, cursor, value, reduce);
    // `source` stands for `value` and `cursor`: both come from the same server render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, name, source]);
  return store.read<T>(name, source) ?? value;
}

/** Another view's live data, e.g. the header's counts on the summary tab. */
export function useLivePeek<T>(name: string, fallback: T): T {
  const store = useLiveStore();
  // The part's value is a stable snapshot between changes. While a boundary
  // hydrates, React reads the server snapshot — the fallback the server rendered.
  const value = useSyncExternalStore(
    store.subscribe,
    () => store.peek<T>(name),
    () => undefined,
  );
  return value ?? fallback;
}

function toLiveEvent(id: number, type: string, data: Record<string, unknown>): LiveEvent {
  return { id, type, data } as unknown as LiveEvent;
}

/** A tab in the background this long closes its stream; it resumes from its cursor on return. */
const HIDDEN_CLOSE_MS = 30_000;

/**
 * Opens the page's event stream and feeds the store.
 *
 * - `run`: one run's stream. It ends with the run, and `onFinish` then settles
 *   the page on the server's final numbers (finishing settles results in bulk).
 * - `project`: every run of a project, for as long as the page is open. The
 *   views insert a run that starts themselves (see `useRunInserts`).
 *
 * The route is re-rendered only as a last resort — when `onFinish` fails —
 * because a refresh empties the router cache and every link on screen
 * prefetches again.
 */
export function LiveConnection({
  streamUrl,
  pollUrl,
  enabled = true,
  mode = 'run',
  label = 'Live',
  className,
  onFinish,
}: {
  streamUrl: string;
  pollUrl?: string;
  enabled?: boolean;
  mode?: 'run' | 'project';
  label?: string;
  className?: string;
  /** Settles the page once the run has finished; resolves false to fall back to a route refresh. */
  onFinish?: () => Promise<boolean>;
}) {
  const store = useLiveStore();
  const router = useRouter();
  const [state, setState] = useState<LiveState>(enabled ? 'connecting' : 'off');
  const routerRef = useRef(router);
  routerRef.current = router;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    if (!enabled) {
      setState('off');
      return;
    }
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let stopped = false;
    let since: number | null = null;
    /** Bumped by every (re)connect, so a poll loop from before it stops. */
    let generation = 0;

    const finish = () => {
      if (stopped) return;
      stopped = true;
      close();
      setState('done');
      store.streamFrom = null;
      const settle = onFinishRef.current;
      void (settle ? settle().catch(() => false) : Promise.resolve(false)).then((ok) => {
        if (!ok) routerRef.current.refresh();
      });
    };

    const receive = (ev: LiveEvent) => {
      store.apply(ev);
      if (mode === 'run' && ev.type === 'run.finished') finish();
    };

    const close = () => {
      generation++;
      es?.close();
      es = null;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    };

    const startPolling = () => {
      if (!pollUrl || stopped) return;
      setState('polling');
      const mine = generation;
      const tick = async () => {
        if (stopped || generation !== mine) return;
        if (document.hidden) {
          pollTimer = setTimeout(tick, 5000);
          return;
        }
        try {
          const res = await fetch(`${pollUrl}?since=${store.lastEventId || since || 0}`, { cache: 'no-store' });
          const body = (await res.json()) as {
            events: { id: number; type: string; runId: string; createdAt: string; payload: Record<string, unknown> }[];
            /** The run is over (the stream's `done`); only the run page's poll says so. */
            done?: boolean;
          };
          for (const e of body.events) receive(toLiveEvent(e.id, e.type, { ...e.payload, runId: e.runId, at: e.createdAt }));
          if (body.done) finish();
        } catch {
          /* keep polling */
        }
        if (!stopped && generation === mine) pollTimer = setTimeout(tick, 2000);
      };
      void tick();
    };

    const connect = (from: number) => {
      if (stopped) return;
      close();
      since = from;
      store.streamStarted(from);
      es = new EventSource(`${streamUrl}?since=${from}`);
      es.onopen = () => {
        failures = 0;
        setState('live');
      };
      const onEvent = (e: MessageEvent) => {
        if (!e.lastEventId) return;
        receive(toLiveEvent(Number(e.lastEventId), e.type, JSON.parse(e.data)));
      };
      for (const t of LIVE_EVENT_TYPES) es.addEventListener(t, onEvent as EventListener);
      // The server closes the stream before its function limit; resume at once.
      es.addEventListener('bye', () => connect(store.lastEventId || from));
      es.addEventListener('done', finish);
      es.onerror = () => {
        failures++;
        if (failures >= 3 && pollUrl) {
          close();
          startPolling();
        } else {
          setState('connecting');
        }
      };
    };

    // A part hydrated from a snapshot older than the stream needs those events sent again.
    store.onNeedStream = (cursor) => connect(Math.min(cursor, store.lastEventId || cursor));
    const first = store.minCursor;
    if (first !== null) connect(first);

    const onVisibility = () => {
      if (document.hidden) {
        hiddenTimer = setTimeout(() => {
          close();
          setState('connecting');
        }, HIDDEN_CLOSE_MS);
      } else {
        if (hiddenTimer) clearTimeout(hiddenTimer);
        hiddenTimer = null;
        if (!es && !pollTimer && !stopped && since !== null) connect(store.lastEventId || since);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      close();
      store.onNeedStream = null;
      store.streamFrom = null;
      document.removeEventListener('visibilitychange', onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [store, streamUrl, pollUrl, enabled, mode]);

  return <LiveIndicator state={state} label={label} className={className} />;
}
