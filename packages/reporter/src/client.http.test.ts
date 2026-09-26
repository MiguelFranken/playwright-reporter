/**
 * The client against a real HTTP server, speaking what the ingest routes
 * speak: no fetch mock, so Node's fetch, the gzip body and redirects are the
 * real ones.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PROTOCOL_HEADER, PROTOCOL_VERSION } from '@miguelfranken/protocol';
import { HttpError, IngestClient } from './client';
import type { ResolvedOptions } from './types';

interface Received {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

let server: Server;
let serverUrl: string;
const received: Received[] = [];
let respond: (req: Received) => { status: number; body?: unknown; location?: string };

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    let raw = Buffer.concat(chunks);
    if (req.headers['content-encoding'] === 'gzip') raw = gunzipSync(raw);
    const entry = { method: req.method!, url: req.url!, headers: req.headers, body: raw.length ? JSON.parse(raw.toString('utf8')) : undefined };
    received.push(entry);
    const answer = respond(entry);
    if (answer.location) res.setHeader('location', answer.location);
    res.statusCode = answer.status;
    if (answer.body !== undefined) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(answer.body));
    } else {
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  received.length = 0;
  respond = () => ({ status: 200, body: { accepted: 0, lastSeq: -1 } });
});

const client = (overrides: Partial<ResolvedOptions> = {}) =>
  new IngestClient(
    {
      token: 'pwr_secret',
      serverUrl,
      ciRunId: 'build-1',
      tags: [],
      artifacts: true,
      debug: false,
      batchSize: 50,
      batchIntervalMs: 1000,
      git: {},
      ci: {},
      uploadTimeoutMs: 120_000,
      heartbeatIntervalMs: 30_000,
      maxRetries: 0,
      ...overrides,
    },
    () => undefined,
  );

describe('IngestClient over HTTP', () => {
  it('posts the input as JSON, with the run id in the path', async () => {
    const result = await client().sendEvents('run-1', { shardIndex: 2, events: [] });

    expect(result).toEqual({ accepted: 0, lastSeq: -1 });
    expect(received).toHaveLength(1);
    const [req] = received;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/api/ingest/runs/run-1/events');
    expect(req.headers.authorization).toBe('Bearer pwr_secret');
    expect(req.headers[PROTOCOL_HEADER]).toBe(String(PROTOCOL_VERSION));
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.body).toEqual({ shardIndex: 2, events: [] });
  });

  it('gzips a large batch, and the server reads back the same JSON', async () => {
    const events = Array.from({ length: 200 }, (_, seq) => ({ seq, type: 'run.log' as const, level: 'info' as const, message: 'x'.repeat(300) }));
    await client().sendEvents('run-1', { shardIndex: 1, events });

    expect(received[0].headers['content-encoding']).toBe('gzip');
    expect(received[0].body).toEqual({ shardIndex: 1, events });
  });

  it('turns an { error } answer into an HttpError with its status', async () => {
    respond = () => ({ status: 426, body: { error: 'unsupported protocol version 2; server speaks 1' } });

    const error = await client()
      .startRun({} as never)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(426);
    expect((error as HttpError).message).toBe('426: unsupported protocol version 2; server speaks 1');
  });

  it('follows a redirect that keeps the method', async () => {
    respond = (req) =>
      req.url.startsWith('/old')
        ? { status: 308, location: `${serverUrl}/api/ingest/runs/run-1/finish` }
        : { status: 200, body: { runStatus: 'passed', url: 'http://app/runs/1' } };
    const result = await client({ serverUrl: `${serverUrl}/old` }).finishRun('run-1', { shardIndex: 1, status: 'passed', durationMs: 1, finishedAt: '2026-01-01T00:00:00Z' });
    expect(result).toEqual({ runStatus: 'passed', url: 'http://app/runs/1' });
    expect(received.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /old/api/ingest/runs/run-1/finish', 'POST /api/ingest/runs/run-1/finish']);
  });
});
