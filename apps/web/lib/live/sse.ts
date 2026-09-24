import type { RunEvent } from '@/lib/db/schema';

/** Poll interval while events are flowing. */
const POLL_MS = 1000;
/** Poll interval an idle stream backs off to. */
const IDLE_POLL_MS = 4000;
const PING_MS = 15_000;
/** How often `isDone` is asked; the stream normally ends on an `endsWith` event first. */
const DONE_CHECK_MS = 30_000;
/**
 * A stream closes itself before the platform's function limit (300 s) cuts it
 * off mid-frame. The `bye` frame tells the client to reconnect at once from
 * its cursor instead of treating the close as a failure.
 */
export const MAX_STREAM_MS = 240_000;
/**
 * The event queries read slightly behind the newest commit (see
 * `eventsSince`), so once `isDone` says the run is over the stream keeps
 * polling this long for the last events before it says `done`.
 */
const DRAIN_MS = 1000;

export interface SseSource {
  /** Fetch events with id greater than cursor. */
  poll(cursor: number): Promise<RunEvent[]>;
  /** Return true when the stream should end after flushing. */
  isDone?(): Promise<boolean>;
  /** Newest event id; used as the starting cursor when the client provides none. */
  latest?(): Promise<number>;
  /** An event after which nothing more will come, e.g. `run.finished` on a run stream. */
  endsWith?(event: RunEvent): boolean;
}

export function parseCursor(request: Request): number | null {
  const lastId = request.headers.get('last-event-id');
  const since = new URL(request.url).searchParams.get('since');
  const raw = lastId ?? since;
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Streams run events as Server-Sent Events, polling the database.
 *
 * Each open stream is a function instance and a query every tick, so it polls
 * quickly only while events flow and backs off when the run goes quiet.
 */
export function sseResponse(request: Request, source: SseSource) {
  const requested = parseCursor(request);
  let cursor = requested ?? 0;
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };
      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        if (ping) clearInterval(ping);
        if (lifetime) clearTimeout(lifetime);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener('abort', stop);
      send(`retry: 2000\n: connected\n\n`);
      ping = setInterval(() => send(': ping\n\n'), PING_MS);
      lifetime = setTimeout(() => {
        send(`event: bye\ndata: {}\n\n`);
        stop();
      }, MAX_STREAM_MS);

      let interval = POLL_MS;
      let idleTicks = 0;
      let lastDoneCheck = -Infinity;
      let doneSince: number | null = null;
      const tick = async () => {
        if (closed) return;
        try {
          // Without a client cursor, skip history: the page already rendered the current state.
          if (requested === null && source.latest && cursor === 0) cursor = await source.latest();
          const events = await source.poll(cursor);
          for (const ev of events) {
            cursor = ev.id;
            send(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify({ ...ev.payload, runId: ev.runId, at: ev.createdAt })}\n\n`);
          }
          const ended = source.endsWith && events.some((ev) => source.endsWith!(ev));
          const checkDone = !ended && doneSince === null && source.isDone && Date.now() - lastDoneCheck >= DONE_CHECK_MS;
          if (checkDone) {
            lastDoneCheck = Date.now();
            if (await source.isDone!()) doneSince = Date.now();
          }
          if (ended || (doneSince !== null && Date.now() - doneSince >= DRAIN_MS)) {
            send(`event: done\ndata: {}\n\n`);
            stop();
            return;
          }
          // A short pause between tests is normal; back off only once the run has gone quiet.
          idleTicks = events.length ? 0 : idleTicks + 1;
          interval = idleTicks < 3 || doneSince !== null ? POLL_MS : Math.min(IDLE_POLL_MS, Math.round(interval * 1.5));
        } catch (err) {
          console.error('[sse] poll failed', err);
        }
        if (!closed) timer = setTimeout(tick, interval);
      };
      void tick();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
      if (lifetime) clearTimeout(lifetime);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
