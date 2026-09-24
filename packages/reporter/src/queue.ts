import type { IngestEvent } from '@miguelfranken/protocol';

/** Per request, however far behind the sender is. The server accepts 1000 events and 4 MB. */
const MAX_BATCH_EVENTS = 250;
const MAX_BATCH_BYTES = 1024 * 1024;

/**
 * Batches events and flushes them when the batch is full or the interval elapses.
 * Flushes are serialized so the server always sees increasing sequence numbers.
 *
 * A batch is cut when its send *starts*, not when the flush is asked for: while
 * one request is in flight, everything that arrives joins the next one. A slow
 * server then gets fewer, larger requests instead of a growing line of small ones.
 */
export class EventQueue {
  private pending: IngestEvent[] = [];
  private timer: NodeJS.Timeout | undefined;
  private chain: Promise<void> = Promise.resolve();
  private seq = 0;

  constructor(
    private readonly size: number,
    private readonly intervalMs: number,
    private readonly send: (events: IngestEvent[]) => Promise<void>,
    private readonly maxBatch = Math.max(size, MAX_BATCH_EVENTS),
  ) {}

  nextSeq() {
    return this.seq++;
  }

  push(event: IngestEvent) {
    this.pending.push(event);
    if (this.pending.length >= this.size) {
      void this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.intervalMs);
      this.timer.unref?.();
    }
  }

  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending.length === 0) return this.chain;
    this.chain = this.chain.then(() => this.sendPending()).catch(() => undefined);
    return this.chain;
  }

  /** Sends what is pending now, in as few requests as the limits allow. */
  private async sendPending() {
    while (this.pending.length) {
      let bytes = 0;
      let count = 0;
      while (count < this.pending.length && count < this.maxBatch) {
        bytes += JSON.stringify(this.pending[count]).length;
        if (count > 0 && bytes > MAX_BATCH_BYTES) break;
        count++;
      }
      const batch = this.pending.splice(0, count);
      await this.send(batch).catch(() => undefined);
    }
  }

  /** Flushes everything and waits for all in-flight sends. */
  async drain(): Promise<void> {
    await this.flush();
    await this.chain;
  }
}
