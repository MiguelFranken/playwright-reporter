import type { RunEvent } from '@/lib/db/schema';

const POLL_MS = 1000;
const PING_MS = 15_000;

export interface SseSource {
  /** Fetch events with id greater than cursor. */
  poll(cursor: number): Promise<RunEvent[]>;
  /** Return true when the stream should end after flushing. */
  isDone?(): Promise<boolean>;
  /** Newest event id; used as the starting cursor when the client provides none. */
  latest?(): Promise<number>;
}

export function parseCursor(request: Request): number | null {
  const lastId = request.headers.get('last-event-id');
  const since = new URL(request.url).searchParams.get('since');
  const raw = lastId ?? since;
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Streams run events as Server-Sent Events, polling the database. */
export function sseResponse(request: Request, source: SseSource) {
  const requested = parseCursor(request);
  let cursor = requested ?? 0;
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

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
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener('abort', stop);
      send(`retry: 2000\n: connected\n\n`);
      ping = setInterval(() => send(': ping\n\n'), PING_MS);

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
          if (source.isDone && (await source.isDone())) {
            send(`event: done\ndata: {}\n\n`);
            stop();
            return;
          }
        } catch (err) {
          console.error('[sse] poll failed', err);
        }
        if (!closed) timer = setTimeout(tick, POLL_MS);
      };
      void tick();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
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
