import type { IngestEvent } from '@repo/protocol';

/**
 * Batches events and flushes them when the batch is full or the interval elapses.
 * Flushes are serialized so the server always sees increasing sequence numbers.
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
    const batch = this.pending;
    this.pending = [];
    this.chain = this.chain.then(() => this.send(batch)).catch(() => undefined);
    return this.chain;
  }

  /** Flushes everything and waits for all in-flight sends. */
  async drain(): Promise<void> {
    await this.flush();
    await this.chain;
  }
}
