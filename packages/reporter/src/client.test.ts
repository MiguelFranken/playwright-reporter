import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_HEADER, PROTOCOL_VERSION } from '@miguelfranken/protocol';
import { HttpError, IngestClient } from './client';
import type { ResolvedOptions } from './types';

const options = (overrides: Partial<ResolvedOptions> = {}): ResolvedOptions => ({
  token: 'pwr_secret',
  serverUrl: 'https://reports.example.test',
  ciRunId: 'build-1',
  tags: [],
  artifacts: true,
  debug: false,
  batchSize: 50,
  batchIntervalMs: 1000,
  git: {},
  ci: {},
  uploadTimeoutMs: 120_000,
  maxRetries: 2,
  ...overrides,
});

const ok = (body: unknown = { ok: true }) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, body = 'nope') => new Response(body, { status });

let fetchMock: ReturnType<typeof vi.fn>;
const logs: string[] = [];
const client = (overrides: Partial<ResolvedOptions> = {}) => new IngestClient(options(overrides), (m) => logs.push(m));

beforeEach(() => {
  logs.length = 0;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Runs a client call while letting the backoff timers fire. */
async function withTimers<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if ('error' in result) throw result.error;
  return result.value as T;
}

describe('request headers', () => {
  it('sends the bearer token and the protocol version', async () => {
    fetchMock.mockResolvedValue(ok({ runId: 'r1' }));
    await withTimers(client().startRun({} as never));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://reports.example.test/api/ingest/runs');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer pwr_secret');
    expect(init.headers[PROTOCOL_HEADER]).toBe(String(PROTOCOL_VERSION));
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('addresses each endpoint by run id', async () => {
    // A Response body can only be read once, so hand out a fresh one per call.
    fetchMock.mockImplementation(async () => ok());
    const c = client();
    await withTimers(c.sendEvents('r1', { shardIndex: 1, events: [] }));
    await withTimers(c.uploadUrls('r1', ['a1']));
    await withTimers(c.completeUpload('r1', 'a1', 5));
    await withTimers(c.finishRun('r1', {} as never));

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://reports.example.test/api/ingest/runs/r1/events',
      'https://reports.example.test/api/ingest/runs/r1/attachments/upload-urls',
      'https://reports.example.test/api/ingest/runs/r1/attachments/a1/complete',
      'https://reports.example.test/api/ingest/runs/r1/finish',
    ]);
  });
});

describe('gzip threshold', () => {
  it('sends a small body uncompressed', async () => {
    fetchMock.mockResolvedValue(ok());
    await withTimers(client().sendEvents('r1', { shardIndex: 1, events: [] }));

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['content-encoding']).toBeUndefined();
    expect(init.body).toBe(JSON.stringify({ shardIndex: 1, events: [] }));
  });

  it('gzips a body over 32 KiB, and the server can read it back', async () => {
    fetchMock.mockResolvedValue(ok());
    const body = { shardIndex: 1, padding: 'x'.repeat(40 * 1024) };
    await withTimers(client().sendEvents('r1', body as never));

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['content-encoding']).toBe('gzip');
    expect(init.body).toBeInstanceOf(Blob);
    const raw = new Uint8Array(await (init.body as Blob).arrayBuffer());
    expect(JSON.parse(gunzipSync(raw).toString('utf8'))).toEqual(body);
    // Compression is worth it at this size.
    expect(raw.byteLength).toBeLessThan(40 * 1024);
  });
});

describe('retries', () => {
  it.each([500, 502, 503, 408, 429])('retries a %i and returns the eventual success', async (status) => {
    fetchMock.mockResolvedValueOnce(fail(status)).mockResolvedValue(ok({ accepted: 1 }));
    const result = await withTimers(client().sendEvents('r1', { shardIndex: 1, events: [] }));

    expect(result).toEqual({ accepted: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logs[0]).toContain('retrying in');
  });

  it.each([400, 401, 404, 413, 426])('does not retry a %i', async (status) => {
    fetchMock.mockResolvedValue(fail(status, 'denied'));

    await expect(withTimers(client().startRun({} as never))).rejects.toSatisfy(
      (error: unknown) => error instanceof HttpError && error.status === status,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a network error, which has no status at all', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(ok());
    await withTimers(client().startRun({} as never));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and rethrows the last error', async () => {
    fetchMock.mockResolvedValue(fail(503));

    await expect(withTimers(client({ maxRetries: 2 }).startRun({} as never))).rejects.toThrow(/503/);
    // The first attempt plus two retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('backs off exponentially and stops doubling at 8 s', async () => {
    fetchMock.mockResolvedValue(fail(503));
    await expect(withTimers(client({ maxRetries: 6 }).startRun({} as never))).rejects.toThrow();

    const delays = logs.map((line) => Number(/retrying in (\d+)ms/.exec(line)![1]));
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 8000]);
  });

  it('includes the server message, truncated, in the error', async () => {
    fetchMock.mockResolvedValue(fail(400, 'x'.repeat(2000)));
    await expect(withTimers(client().startRun({} as never))).rejects.toSatisfy(
      (error: unknown) => (error as Error).message.length < 600,
    );
  });
});

describe('upload', () => {
  const instruction = {
    attachmentId: 'a1',
    strategy: 'proxy' as const,
    method: 'PUT' as const,
    url: 'https://reports.example.test/api/ingest/uploads/a1',
    headers: { 'content-type': 'image/png' },
  };

  it('PUTs the body and returns its size', async () => {
    fetchMock.mockResolvedValue(ok());
    const size = await withTimers(client().upload(instruction, { body: Buffer.from('12345') }, 'image/png'));

    expect(size).toBe(5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(instruction.url);
    expect(init.method).toBe('PUT');
    // The proxy strategy goes through our own app, so it carries the token.
    expect(init.headers.authorization).toBe('Bearer pwr_secret');
  });

  it('does not send the token to a presigned third-party URL', async () => {
    fetchMock.mockResolvedValue(ok());
    await withTimers(
      client().upload(
        { ...instruction, strategy: 'presigned', url: 'https://blob.vercel-storage.test/x' },
        { body: Buffer.from('1') },
        'image/png',
      ),
    );
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
  });

  it('retries a failed upload and gives up after maxRetries', async () => {
    fetchMock.mockResolvedValue(fail(500));
    await expect(withTimers(client({ maxRetries: 1 }).upload(instruction, { body: Buffer.from('1') }, 'image/png'))).rejects.toThrow(
      /upload failed with 500/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejected upload', async () => {
    fetchMock.mockResolvedValue(fail(403));
    await expect(withTimers(client().upload(instruction, { body: Buffer.from('1') }, 'image/png'))).rejects.toThrow(/403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when the attachment has neither a path nor a body', async () => {
    await expect(withTimers(client().upload(instruction, {}, 'image/png'))).rejects.toThrow(/neither path nor body/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
