import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from './client';
import { Heartbeat } from './heartbeat';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Heartbeat', () => {
  it('beats every interval until stopped', async () => {
    const beat = vi.fn(async () => undefined);
    const hb = new Heartbeat(30_000, beat, () => undefined);
    hb.start();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(beat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(beat).toHaveBeenCalledTimes(3);
    hb.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(beat).toHaveBeenCalledTimes(3);
  });

  it('is off at an interval of 0', async () => {
    const beat = vi.fn(async () => undefined);
    new Heartbeat(0, beat, () => undefined).start();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(beat).not.toHaveBeenCalled();
  });

  it('keeps beating after a failure, but stops for good on a server without the endpoint', async () => {
    const logs: string[] = [];
    const beat = vi.fn().mockRejectedValueOnce(new Error('network down')).mockRejectedValueOnce(new HttpError(404, 'not found'));
    new Heartbeat(1000, beat, (m) => logs.push(m)).start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(beat).toHaveBeenCalledTimes(2);
    expect(logs).toEqual(['heartbeat failed: network down', 'server does not accept heartbeats; stopping them']);
  });

  it('never overlaps a slow beat with the next one', async () => {
    let release!: () => void;
    const beat = vi.fn(() => new Promise<void>((r) => (release = r)));
    new Heartbeat(1000, beat, () => undefined).start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(beat).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(beat).toHaveBeenCalledTimes(2);
  });
});
