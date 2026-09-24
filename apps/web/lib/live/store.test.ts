import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveEvent } from './events';
import { LiveStore } from './store';

const log = (id: number): LiveEvent => ({ id, type: 'run.log', data: { level: 'info', message: String(id), runId: 'r', at: '' } });
/** A reducer that records which events it saw. */
const seen = (value: number[], ev: LiveEvent) => [...value, ev.id];

describe('LiveStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('replays the events a part missed between its snapshot and hydration', () => {
    const store = new LiveStore();
    store.apply(log(1));
    store.apply(log(2));
    store.apply(log(3));
    store.hydrate('p', 'server', 1, [] as number[], seen);
    expect(store.read<number[]>('p', 'server')).toEqual([2, 3]);
  });

  it('applies each event once per part, at the part’s own cursor', () => {
    const store = new LiveStore();
    store.hydrate('old', 'a', 5, [] as number[], seen);
    store.hydrate('new', 'b', 7, [] as number[], seen);
    for (const id of [6, 7, 8]) store.apply(log(id));
    store.apply(log(7)); // resent after a reconnect
    expect(store.peek('old')).toEqual([6, 7, 8]);
    expect(store.peek('new')).toEqual([8]);
  });

  it('asks for the stream from the oldest snapshot it has', () => {
    const store = new LiveStore();
    const need = vi.fn();
    store.onNeedStream = need;
    store.hydrate('a', 'a', 10, [] as number[], seen);
    expect(need).toHaveBeenLastCalledWith(10);
    store.streamFrom = 10;
    store.hydrate('b', 'b', 12, [] as number[], seen);
    expect(need).toHaveBeenCalledTimes(1);
    store.hydrate('c', 'c', 8, [] as number[], seen);
    expect(need).toHaveBeenLastCalledWith(8);
  });

  it('keeps a part until the server sends different data', () => {
    const store = new LiveStore();
    const source = {};
    store.hydrate('p', source, 0, [] as number[], seen);
    store.apply(log(1));
    store.hydrate('p', source, 0, [] as number[], seen);
    expect(store.read('p', source)).toEqual([1]);
    expect(store.read('p', {})).toBeUndefined();
  });

  it('coalesces a burst of events into one notification', () => {
    const store = new LiveStore();
    store.hydrate('p', 's', 0, [] as number[], seen);
    const listener = vi.fn();
    store.subscribe(listener);
    for (let id = 1; id <= 20; id++) store.apply(log(id));
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
