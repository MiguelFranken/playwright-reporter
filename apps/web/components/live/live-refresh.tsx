'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LiveIndicator, type LiveState } from '@miguelfranken/ui/patterns/live-indicator';

type State = LiveState;

/**
 * Subscribes to a Server-Sent Events endpoint and refreshes the current route
 * (re-rendering its Server Components) whenever new events arrive. Falls back to
 * polling the `pollUrl` if the stream keeps failing.
 */
export function LiveRefresh({
  streamUrl,
  pollUrl,
  enabled = true,
  className,
  label = 'Live',
  mode = 'run',
}: {
  streamUrl: string;
  pollUrl?: string;
  enabled?: boolean;
  className?: string;
  label?: string;
  /** `run`: the stream ends when the run finishes. `project`: stays live across runs. */
  mode?: 'run' | 'project';
}) {
  const router = useRouter();
  const [state, setState] = useState<State>(enabled ? 'connecting' : 'off');
  const cursor = useRef(0);
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState('off');
      return;
    }
    let es: EventSource | null = null;
    let failures = 0;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const scheduleRefresh = () => {
      if (pendingRefresh.current) return;
      pendingRefresh.current = setTimeout(() => {
        pendingRefresh.current = null;
        router.refresh();
      }, 400);
    };

    const startPolling = () => {
      if (!pollUrl || stopped) return;
      setState('polling');
      const tick = async () => {
        if (stopped) return;
        try {
          const res = await fetch(`${pollUrl}?since=${cursor.current}`, { cache: 'no-store' });
          const data = (await res.json()) as { events: { id: number; type: string }[]; cursor: number };
          if (data.events.length) {
            cursor.current = data.cursor;
            scheduleRefresh();
            if (mode === 'run' && data.events.some((e) => e.type === 'run.finished')) {
              setState('done');
              return;
            }
          }
        } catch {
          /* keep polling */
        }
        pollTimer = setTimeout(tick, 2000);
      };
      void tick();
    };

    const connect = () => {
      if (stopped) return;
      const url = cursor.current ? `${streamUrl}?since=${cursor.current}` : streamUrl;
      es = new EventSource(url);
      es.onopen = () => {
        failures = 0;
        setState('live');
      };
      es.onmessage = (ev) => {
        if (ev.lastEventId) cursor.current = Number(ev.lastEventId);
        scheduleRefresh();
      };
      const onTyped = (ev: MessageEvent) => {
        if (ev.lastEventId) cursor.current = Number(ev.lastEventId);
        scheduleRefresh();
      };
      for (const t of ['run.started', 'shard.started', 'test.begin', 'attempt.end', 'shard.finished', 'run.log']) {
        es.addEventListener(t, onTyped as EventListener);
      }
      es.addEventListener('run.finished', ((ev: MessageEvent) => {
        onTyped(ev);
        if (mode === 'run') setState('done');
      }) as EventListener);
      es.addEventListener('done', () => {
        setState('done');
        es?.close();
        stopped = true;
        scheduleRefresh();
      });
      es.onerror = () => {
        failures++;
        if (failures >= 3 && pollUrl) {
          es?.close();
          startPolling();
        } else {
          setState('connecting');
        }
      };
    };
    connect();

    return () => {
      stopped = true;
      es?.close();
      if (pollTimer) clearTimeout(pollTimer);
      if (pendingRefresh.current) {
        clearTimeout(pendingRefresh.current);
        pendingRefresh.current = null;
      }
    };
  }, [streamUrl, pollUrl, enabled, router, mode]);

  return <LiveIndicator state={state} label={label} className={className} />;
}
