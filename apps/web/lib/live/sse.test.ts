import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '@/lib/db/schema';
import { MAX_STREAM_MS, parseCursor, sseResponse, type SseSource } from './sse';

function request(url = 'http://test.local/live', headers: HeadersInit = {}, signal?: AbortSignal) {
  return new Request(url, { headers, signal });
}

function event(id: number, type = 'attempt.end', payload: Record<string, unknown> = {}): RunEvent {
  return {
    id,
    runId: 'run-1',
    projectId: 'project-1',
    type,
    payload,
    createdAt: new Date('2026-09-17T10:00:00.000Z'),
  };
}

describe('parseCursor', () => {
  it('is null when the client asks for neither', () => {
    expect(parseCursor(request())).toBeNull();
  });

  it('reads the `since` query parameter', () => {
    expect(parseCursor(request('http://test.local/live?since=42'))).toBe(42);
  });

  it('prefers Last-Event-ID over `since`', () => {
    expect(parseCursor(request('http://test.local/live?since=42', { 'last-event-id': '99' }))).toBe(99);
  });

  it('treats an unparsable cursor as 0, which replays from the start', () => {
    expect(parseCursor(request('http://test.local/live?since=abc'))).toBe(0);
    expect(parseCursor(request('http://test.local/live', { 'last-event-id': 'nope' }))).toBe(0);
  });

  it('accepts an explicit 0', () => {
    expect(parseCursor(request('http://test.local/live?since=0'))).toBe(0);
  });
});

describe('sseResponse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Reads frames until the stream closes or `stopAfter` polls have happened. */
  async function collect(response: Response, advanceMs = 0) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const pump = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        text += decoder.decode(value, { stream: true });
      }
    })();
    await vi.advanceTimersByTimeAsync(advanceMs);
    await Promise.race([pump, Promise.resolve()]);
    return { text: () => text, pump, reader };
  }

  it('announces the retry interval and the connection immediately', async () => {
    const source: SseSource = { poll: async () => [] };
    const collected = await collect(sseResponse(request(), source));
    expect(collected.text()).toContain('retry: 2000');
    expect(collected.text()).toContain(': connected');
  });

  it('sets the headers a browser EventSource needs', () => {
    const response = sseResponse(request(), { poll: async () => [] });
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
  });

  it('emits id, event and data frames for each event', async () => {
    const source: SseSource = {
      poll: vi.fn(async (cursor: number) => (cursor < 7 ? [event(7, 'attempt.end', { title: 'a test' })] : [])),
    };
    const collected = await collect(sseResponse(request('http://test.local/live?since=0'), source), 10);

    expect(collected.text()).toContain('id: 7\n');
    expect(collected.text()).toContain('event: attempt.end\n');
    const data = /data: (.*)\n/.exec(collected.text())![1];
    expect(JSON.parse(data)).toMatchObject({ title: 'a test', runId: 'run-1' });
  });

  it('skips history when the client sends no cursor', async () => {
    const poll = vi.fn(async () => []);
    const latest = vi.fn(async () => 120);
    await collect(sseResponse(request(), { poll, latest }), 10);

    // The page already rendered the current state, so the stream starts at the newest id.
    expect(latest).toHaveBeenCalled();
    expect(poll).toHaveBeenCalledWith(120);
  });

  it('replays from the client cursor and never calls latest()', async () => {
    const poll = vi.fn(async () => []);
    const latest = vi.fn(async () => 120);
    await collect(sseResponse(request('http://test.local/live?since=5'), { poll, latest }), 10);

    expect(latest).not.toHaveBeenCalled();
    expect(poll).toHaveBeenCalledWith(5);
  });

  it('advances the cursor past the events it already sent', async () => {
    const poll = vi.fn(async (cursor: number) => (cursor === 0 ? [event(1), event(2)] : []));
    await collect(sseResponse(request('http://test.local/live?since=0'), { poll }), 3000);

    expect(poll).toHaveBeenNthCalledWith(1, 0);
    expect(poll.mock.calls.slice(1).every(([cursor]) => cursor === 2)).toBe(true);
  });

  it('sends a done frame and closes once the source reports it is finished', async () => {
    const source: SseSource = {
      poll: async () => [event(1, 'run.finished', { status: 'passed' })],
      isDone: async () => true,
    };
    const collected = await collect(sseResponse(request('http://test.local/live?since=0'), source), 1500);
    await collected.pump;

    expect(collected.text()).toContain('event: run.finished');
    expect(collected.text()).toContain('event: done\ndata: {}');
    // The reader saw the close, which is what ends the pump.
    await expect(collected.reader.read()).resolves.toMatchObject({ done: true });
  });

  it('keeps polling while the source is not done', async () => {
    const poll = vi.fn(async () => []);
    sseResponse(request('http://test.local/live?since=0'), { poll, isDone: async () => false });
    await vi.advanceTimersByTimeAsync(3500);
    expect(poll.mock.calls.length).toBeGreaterThan(2);
  });

  it('survives a failing poll and tries again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const poll = vi
      .fn<SseSource['poll']>()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValue([]);
    sseResponse(request('http://test.local/live?since=0'), { poll });

    await vi.advanceTimersByTimeAsync(2500);
    expect(poll.mock.calls.length).toBeGreaterThan(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('stops when the request is aborted', async () => {
    const controller = new AbortController();
    const poll = vi.fn(async () => []);
    sseResponse(request('http://test.local/live?since=0', {}, controller.signal), { poll });

    await vi.advanceTimersByTimeAsync(10);
    const before = poll.mock.calls.length;
    controller.abort();
    await vi.advanceTimersByTimeAsync(5000);

    expect(poll.mock.calls.length).toBe(before);
  });

  it('sends a keep-alive comment on the ping interval', async () => {
    const collected = await collect(sseResponse(request('http://test.local/live?since=0'), { poll: async () => [] }), 16_000);
    expect(collected.text()).toContain(': ping');
  });
  it('ends on an endsWith event without asking isDone', async () => {
    const isDone = vi.fn(async () => false);
    const source: SseSource = {
      poll: async (cursor) => (cursor === 0 ? [event(1, 'run.finished', { status: 'passed' })] : []),
      isDone,
      endsWith: (ev) => ev.type === 'run.finished',
    };
    const collected = await collect(sseResponse(request('http://test.local/live?since=0'), source), 10);
    await collected.pump;

    expect(collected.text()).toContain('event: done');
    expect(isDone).not.toHaveBeenCalled();
  });

  it('asks isDone at most every 30 seconds, not on every poll', async () => {
    const isDone = vi.fn(async () => false);
    const poll = vi.fn(async () => []);
    sseResponse(request('http://test.local/live?since=0'), { poll, isDone });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(poll.mock.calls.length).toBeGreaterThan(5);
    expect(isDone).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(isDone).toHaveBeenCalledTimes(2);
  });

  it('backs off while idle and polls every second again once events flow', async () => {
    let calls = 0;
    const poll = vi.fn(async () => (++calls === 8 ? [event(calls)] : []));
    sseResponse(request('http://test.local/live?since=0'), { poll });
    await vi.advanceTimersByTimeAsync(20_000);
    const times = poll.mock.invocationCallOrder.length;
    // Three quick polls, then 1.5 s → 2.25 s → 3.4 s → 4 s …, and back to 1 s after the event.
    expect(times).toBeGreaterThan(8);
    expect(times).toBeLessThan(15);
  });

  it('says bye and closes before the function limit, so the client reconnects cleanly', async () => {
    const collected = await collect(sseResponse(request('http://test.local/live?since=0'), { poll: async () => [] }), MAX_STREAM_MS + 10);
    await collected.pump;
    expect(collected.text()).toContain('event: bye');
    expect(MAX_STREAM_MS).toBeLessThan(300_000);
  });
});
