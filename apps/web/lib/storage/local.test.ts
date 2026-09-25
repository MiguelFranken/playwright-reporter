/**
 * The local adapter only touches a temp directory, so it stays a unit test even
 * though it does real I/O.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storageContract } from '@/test/helpers/storage-contract';
import { LocalStorageAdapter } from './local';

let root: string;
let storage: LocalStorageAdapter;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'pwr-local-'));
  storage = new LocalStorageAdapter(root, 'http://test.local');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const bytes = (text: string) => new TextEncoder().encode(text);

async function read(stream: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

describe('put', () => {
  it('writes a buffer and reports its size', async () => {
    const result = await storage.put('a/b/hello.txt', bytes('hello'), { contentType: 'text/plain' });
    expect(result).toEqual({ size: 5 });
    expect(await readFile(path.join(root, 'a/b/hello.txt'), 'utf8')).toBe('hello');
  });

  it('writes a stream and counts the bytes as they pass', async () => {
    const stream = Readable.toWeb(Readable.from([bytes('abc'), bytes('de')])) as ReadableStream<Uint8Array>;
    const result = await storage.put('streamed.txt', stream, { contentType: 'text/plain' });
    expect(result).toEqual({ size: 5 });
    expect(await readFile(path.join(root, 'streamed.txt'), 'utf8')).toBe('abcde');
  });

  it('records the content type in a sidecar', async () => {
    await storage.put('x.png', bytes('123'), { contentType: 'image/png' });
    const meta = JSON.parse(await readFile(path.join(root, 'x.png.meta.json'), 'utf8'));
    expect(meta).toEqual({ contentType: 'image/png', size: 3 });
  });

  it('overwrites an existing object', async () => {
    await storage.put('x.txt', bytes('first'), { contentType: 'text/plain' });
    await storage.put('x.txt', bytes('second'), { contentType: 'text/plain' });
    expect(await readFile(path.join(root, 'x.txt'), 'utf8')).toBe('second');
  });
});

describe('head and get', () => {
  beforeEach(async () => {
    await storage.put('doc.txt', bytes('0123456789'), { contentType: 'text/plain' });
  });

  it('reports size and content type', async () => {
    expect(await storage.head('doc.txt')).toEqual({ size: 10, contentType: 'text/plain' });
  });

  it('is null for a key that was never written', async () => {
    expect(await storage.head('missing.txt')).toBeNull();
    expect(await storage.get('missing.txt')).toBeNull();
  });

  it('streams the whole object', async () => {
    const stored = await storage.get('doc.txt');
    expect(stored).not.toBeNull();
    expect(stored!.contentType).toBe('text/plain');
    expect(stored!.size).toBe(10);
    expect(stored!.range).toBeUndefined();
    expect(await read(stored!.stream)).toBe('0123456789');
  });

  it('serves a byte range and reports it back', async () => {
    const stored = await storage.get('doc.txt', { start: 2, end: 5 });
    expect(stored!.range).toEqual({ start: 2, end: 5 });
    expect(stored!.size).toBe(10);
    expect(await read(stored!.stream)).toBe('2345');
  });

  it('clamps an open-ended or overlong range to the object', async () => {
    const open = await storage.get('doc.txt', { start: 7 });
    expect(open!.range).toEqual({ start: 7, end: 9 });
    expect(await read(open!.stream)).toBe('789');

    const tooFar = await storage.get('doc.txt', { start: 0, end: 999 });
    expect(tooFar!.range).toEqual({ start: 0, end: 9 });
  });

  it('falls back to a generic content type when the sidecar is gone', async () => {
    await rm(path.join(root, 'doc.txt.meta.json'));
    expect(await storage.head('doc.txt')).toEqual({ size: 10, contentType: 'application/octet-stream' });
  });
});

describe('delete', () => {
  it('removes the object and its sidecar', async () => {
    await storage.put('gone.txt', bytes('x'), { contentType: 'text/plain' });
    await storage.delete(['gone.txt']);
    expect(await storage.head('gone.txt')).toBeNull();
    await expect(readFile(path.join(root, 'gone.txt.meta.json'))).rejects.toThrow();
  });

  it('is fine with keys that do not exist', async () => {
    await expect(storage.delete(['never-there', 'nor-this'])).resolves.toBeUndefined();
  });
});

describe('key traversal', () => {
  it.each(['../escape.txt', '../../etc/passwd', '/etc/passwd', 'a/../../escape.txt'])('rejects %p', async (key) => {
    await expect(storage.put(key, bytes('x'), { contentType: 'text/plain' })).rejects.toThrow(/invalid storage key/);
    await expect(storage.delete([key])).rejects.toThrow(/invalid storage key/);
  });

  it('reports a traversing key as missing rather than reading outside the root', async () => {
    // head() swallows the throw, which is what keeps get() from leaking a file.
    expect(await storage.head('../escape.txt')).toBeNull();
    expect(await storage.get('../escape.txt')).toBeNull();
  });

  it('allows a nested key inside the root', async () => {
    await expect(storage.put('a/b/c/d.txt', bytes('x'), { contentType: 'text/plain' })).resolves.toEqual({ size: 1 });
  });
});

describe('createUpload', () => {
  it('points the reporter back at the proxy endpoint', async () => {
    const instruction = await storage.createUpload('projects/p/runs/r/attempts/a/id-name.png', {
      contentType: 'image/png',
      attachmentId: 'att-1',
    });
    expect(instruction).toEqual({
      strategy: 'proxy',
      method: 'PUT',
      url: 'http://test.local/api/ingest/uploads/att-1',
      headers: { 'content-type': 'image/png' },
    });
  });
});

describe('name', () => {
  it('identifies the driver stored on the attachment row', () => {
    expect(storage.name).toBe('local');
  });

  it('deletes expired artifacts itself: a directory has no lifecycle rules', () => {
    expect(storage.retention).toBe('app');
  });
});

// The same suite runs against S3 in `test/integration/s3-storage.test.ts`.
storageContract('local', () => storage);
