import { HttpError } from './client';

/**
 * Tells the server the run is alive while no events flow — a long test, a
 * slow global setup — so it is not closed as abandoned. One beat at a time; a
 * failed beat is not retried, the next one is. A server without the endpoint
 * (404) stops it for good.
 */
export class Heartbeat {
  private timer: NodeJS.Timeout | undefined;
  private inFlight = false;

  constructor(
    private readonly intervalMs: number,
    private readonly beat: () => Promise<unknown>,
    private readonly log: (msg: string) => void,
  ) {}

  start() {
    if (this.intervalMs <= 0 || this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // Never the reason the process stays up.
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await this.beat();
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        this.log('server does not accept heartbeats; stopping them');
        this.stop();
      } else {
        this.log(`heartbeat failed: ${(err as Error).message}`);
      }
    } finally {
      this.inFlight = false;
    }
  }
}
