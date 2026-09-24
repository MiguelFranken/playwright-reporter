/**
 * The browser-side store behind the live views.
 *
 * The server renders every view as usual and hands each one a *part*: its data
 * plus the newest event id that data already reflects (the cursor). The store
 * keeps the events it received and applies each one to every part whose
 * cursor is older — also events that arrived before the part was hydrated, so
 * nothing is lost between the render and the stream connecting.
 *
 * Nothing here re-renders a route. That is the point: `router.refresh()` on
 * every event re-rendered the whole page and emptied the router cache, and
 * with it every link prefetch on the screen, which the browser then fetched
 * again.
 */
import type { LiveEvent } from './events';

export type Reducer<T> = (value: T, event: LiveEvent) => T;

interface Part<T> {
  /** The server data the part was hydrated from; a new one replaces the part. */
  source: unknown;
  cursor: number;
  value: T;
  reduce: Reducer<T>;
}

/** Enough for any gap between a render and its stream; older events are in every snapshot. */
const LOG_LIMIT = 5000;
/** Renders are coalesced: a burst of events is one update, not one per event. */
const EMIT_MS = 100;

export class LiveStore {
  private parts = new Map<string, Part<unknown>>();
  /** Received events, ascending by id. */
  private log: LiveEvent[] = [];
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(ev: LiveEvent) => void>();
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped on every change; what `useSyncExternalStore` compares. */
  version = 0;
  /**
   * The cursor the stream started from, or null while no stream is open. A
   * part hydrated from an older snapshot than that asks for a restart.
   */
  streamFrom: number | null = null;
  /** Set by the connection: start (or restart) the stream from this cursor. */
  onNeedStream: ((since: number) => void) | null = null;
  /** The log holds every event after this id (up to the newest); older ones may be missing. */
  private logFrom = Infinity;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  /** Every new event, once — for views that react to one (a run appearing) rather than fold it. */
  onEvent(listener: (ev: LiveEvent) => void) {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private emit(immediate = false) {
    this.version++;
    if (immediate) {
      if (this.emitTimer) clearTimeout(this.emitTimer);
      this.emitTimer = null;
      for (const l of this.listeners) l();
      return;
    }
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      for (const l of this.listeners) l();
    }, EMIT_MS);
  }

  /** The newest event received — where a reconnecting stream resumes. */
  get lastEventId() {
    return this.log.at(-1)?.id ?? 0;
  }

  /** The oldest cursor any part still needs events after. */
  get minCursor() {
    let min = Infinity;
    for (const p of this.parts.values()) min = Math.min(min, p.cursor);
    return Number.isFinite(min) ? min : null;
  }

  /** The part's value, if it was hydrated from `source`; otherwise the caller renders its own props. */
  read<T>(name: string, source: unknown): T | undefined {
    const part = this.parts.get(name);
    return part && part.source === source ? (part.value as T) : undefined;
  }

  /** The part's value whatever it was hydrated from — for views that show another view's data. */
  peek<T>(name: string): T | undefined {
    return this.parts.get(name)?.value as T | undefined;
  }

  hydrate<T>(name: string, source: unknown, cursor: number, value: T, reduce: Reducer<T>) {
    if (this.parts.get(name)?.source === source) return;
    let next = value;
    let at = cursor;
    // Replaying across a gap would move the cursor past events the log never
    // had; the restarted stream delivers them in order instead.
    if (cursor >= this.logFrom) {
      for (const ev of this.log) {
        if (ev.id > at) {
          next = reduce(next, ev);
          at = ev.id;
        }
      }
    }
    this.parts.set(name, { source, cursor: at, value: next, reduce: reduce as Reducer<unknown> });
    this.emit(true);
    // The log only holds what the stream sent; anything older has to be sent again.
    if (this.streamFrom === null || cursor < this.streamFrom) this.onNeedStream?.(cursor);
  }

  /** Called by the connection when a stream starts from `since`. */
  streamStarted(since: number) {
    this.streamFrom = since;
    this.logFrom = Math.min(this.logFrom === Infinity ? since : this.logFrom, since);
  }

  /** Replaces some of a part's data with fresher server data, then replays the log over it. */
  merge<T>(name: string, update: (value: T) => T, replayFilter: (ev: LiveEvent) => boolean) {
    const part = this.parts.get(name) as Part<T> | undefined;
    if (!part) return;
    let next = update(part.value);
    // Row data is absolute, so replaying events the fresh rows already reflect is harmless.
    for (const ev of this.log) if (replayFilter(ev)) next = part.reduce(next, ev);
    part.value = next;
    this.emit();
  }

  apply(ev: LiveEvent) {
    // A restarted stream sends events again; keep one copy, in id order.
    const last = this.lastEventId;
    let isNew = true;
    if (ev.id > last) this.log.push(ev);
    else if (!this.log.some((e) => e.id === ev.id)) {
      this.log.push(ev);
      this.log.sort((a, b) => a.id - b.id);
    } else isNew = false;
    if (this.log.length > LOG_LIMIT) {
      const dropped = this.log.splice(0, this.log.length - LOG_LIMIT);
      this.logFrom = Math.max(this.logFrom, dropped.at(-1)!.id);
    }
    let changed = false;
    for (const part of this.parts.values()) {
      if (ev.id <= part.cursor) continue;
      const next = part.reduce(part.value, ev);
      part.cursor = ev.id;
      if (next !== part.value) {
        part.value = next;
        changed = true;
      }
    }
    if (changed) this.emit();
    if (isNew) for (const l of this.eventListeners) l(ev);
  }
}
