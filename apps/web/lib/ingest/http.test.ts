/**
 * `readJson` handles the request body before anything touches the database, so
 * it is a pure `Request` test.
 */
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IngestError, errorResponse, json, readJson } from './http';

const schema = z.object({ name: z.string(), count: z.number().int() });

function post(body: BodyInit, headers: HeadersInit = {}) {
  return new Request('http://test.local/api/ingest/runs', { method: 'POST', headers, body });
}

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof IngestError) return { status: error.status, message: error.message };
    throw error;
  }
  throw new Error('expected the call to throw');
}

describe('readJson', () => {
  it('parses a plain JSON body', async () => {
    const parsed = await readJson(post(JSON.stringify({ name: 'a', count: 1 })), schema);
    expect(parsed).toEqual({ name: 'a', count: 1 });
  });

  it('gunzips a body the reporter compressed', async () => {
    const body = new Uint8Array(gzipSync(JSON.stringify({ name: 'zipped', count: 2 })));
    const parsed = await readJson(post(body, { 'content-encoding': 'gzip' }), schema);
    expect(parsed).toEqual({ name: 'zipped', count: 2 });
  });

  it('answers 413 for a body over the limit', async () => {
    const big = JSON.stringify({ name: 'x'.repeat(5 * 1024 * 1024), count: 1 });
    expect(await statusOf(readJson(post(big), schema))).toEqual({ status: 413, message: 'payload too large' });
  });

  it('answers 400 for a body that is not JSON', async () => {
    expect(await statusOf(readJson(post('}{'), schema))).toEqual({ status: 400, message: 'invalid json' });
  });

  it('answers 400 when a gzip body cannot be decoded', async () => {
    const result = await statusOf(readJson(post(new Uint8Array([1, 2, 3]), { 'content-encoding': 'gzip' }), schema));
    expect(result).toEqual({ status: 400, message: 'could not decode body' });
  });

  it('answers 400 naming the field that failed validation', async () => {
    const result = await statusOf(readJson(post(JSON.stringify({ name: 'a', count: 'many' })), schema));
    expect(result.status).toBe(400);
    expect(result.message).toContain('invalid payload');
    expect(result.message).toContain('count');
  });

  it('reports several problems at once', async () => {
    const result = await statusOf(readJson(post(JSON.stringify({})), schema));
    expect(result.message).toContain('name');
    expect(result.message).toContain('count');
    expect(result.message).toContain(';');
  });

  it('truncates a very long validation message', async () => {
    const wide = z.object(Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`field_${i}`, z.string()])));
    const result = await statusOf(readJson(post(JSON.stringify({})), wide));
    // `invalid payload: ` plus at most 1000 characters of detail.
    expect(result.message.length).toBeLessThanOrEqual('invalid payload: '.length + 1000);
  });

  it('accepts an empty body as invalid json rather than crashing', async () => {
    expect(await statusOf(readJson(post(''), schema))).toEqual({ status: 400, message: 'invalid json' });
  });
});

describe('json', () => {
  it('defaults to 200 and serializes the body', async () => {
    const response = json({ ok: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('honours an explicit status', () => {
    expect(json({}, 201).status).toBe(201);
  });
});

describe('errorResponse', () => {
  it('passes an IngestError through with its status', async () => {
    const response = errorResponse(new IngestError(404, 'run not found'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'run not found' });
  });

  it('hides anything else behind a 500', async () => {
    const response = errorResponse(new Error('connection string leaked here'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal error' });
  });
});
