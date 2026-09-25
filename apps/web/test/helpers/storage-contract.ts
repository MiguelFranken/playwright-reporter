/**
 * What every storage adapter must do, whatever it stores into. The routes,
 * the ingest service and the retention sweep only see `StorageAdapter`, so
 * one suite run against each driver is what keeps them interchangeable:
 * the filesystem in the unit project, S3 (on LocalStack) in the integration
 * project.
 *
 * `make` is called before each test and must hand back an adapter over an
 * empty store.
 */
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { storageKey } from '@/lib/storage';
import type { StorageAdapter } from '@/lib/storage/types';

const bytes = (text: string) => new TextEncoder().encode(text);

async function readBytes(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readText(stream: ReadableStream<Uint8Array>) {
  return new TextDecoder().decode(await readBytes(stream));
}

/** A web stream in several chunks, the way a request body arrives. */
function chunked(...parts: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

export function storageContract(name: string, make: () => StorageAdapter | Promise<StorageAdapter>) {
  describe(`${name}: the storage contract`, () => {
    let storage: StorageAdapter;
    beforeEach(async () => {
      storage = await make();
    });

    const key = storageKey({ projectId: 'p1', runId: 'r1', attemptId: 'a1', attachmentId: 'at1', name: 'my screenshot (1).png' });

    it('reads back what it wrote, with its size and content type', async () => {
      expect(await storage.put(key, bytes('hello'), { contentType: 'text/plain' })).toEqual({ size: 5 });
      expect(await storage.head(key)).toEqual({ size: 5, contentType: 'text/plain' });
      const stored = await storage.get(key);
      expect(stored).toMatchObject({ size: 5, contentType: 'text/plain' });
      expect(stored!.range).toBeUndefined();
      expect(await readText(stored!.stream)).toBe('hello');
    });

    it('writes a stream and counts its bytes', async () => {
      expect(await storage.put('streamed.txt', chunked(bytes('abc'), bytes('de')), { contentType: 'text/plain' })).toEqual({ size: 5 });
      expect(await readText((await storage.get('streamed.txt'))!.stream)).toBe('abcde');
    });

    it('keeps binary content byte for byte', async () => {
      const data = new Uint8Array(randomBytes(256 * 1024));
      await storage.put('trace.zip', chunked(data.subarray(0, 100_000), data.subarray(100_000)), { contentType: 'application/zip' });
      expect(await storage.head('trace.zip')).toEqual({ size: data.byteLength, contentType: 'application/zip' });
      expect(Buffer.compare(await readBytes((await storage.get('trace.zip'))!.stream), data)).toBe(0);
    });

    it('overwrites an object that exists', async () => {
      await storage.put('x.txt', bytes('first'), { contentType: 'text/plain' });
      await storage.put('x.txt', bytes('second!'), { contentType: 'text/markdown' });
      expect(await storage.head('x.txt')).toEqual({ size: 7, contentType: 'text/markdown' });
      expect(await readText((await storage.get('x.txt'))!.stream)).toBe('second!');
    });

    it('answers null for an object that was never written', async () => {
      expect(await storage.head('missing.txt')).toBeNull();
      expect(await storage.get('missing.txt')).toBeNull();
      expect(await storage.get('missing.txt', { start: 0, end: 1 })).toBeNull();
    });

    it('serves byte ranges and reports them against the full size', async () => {
      await storage.put('doc.txt', bytes('0123456789'), { contentType: 'text/plain' });

      const closed = await storage.get('doc.txt', { start: 2, end: 5 });
      expect(closed).toMatchObject({ size: 10, range: { start: 2, end: 5 } });
      expect(await readText(closed!.stream)).toBe('2345');

      const open = await storage.get('doc.txt', { start: 7 });
      expect(open!.range).toEqual({ start: 7, end: 9 });
      expect(await readText(open!.stream)).toBe('789');

      const overlong = await storage.get('doc.txt', { start: 0, end: 999 });
      expect(overlong!.range).toEqual({ start: 0, end: 9 });
      expect(await readText(overlong!.stream)).toBe('0123456789');
    });

    it('deletes exactly the keys it is given, and is fine with missing ones', async () => {
      await storage.put('a.txt', bytes('a'), { contentType: 'text/plain' });
      await storage.put('b.txt', bytes('b'), { contentType: 'text/plain' });
      await storage.delete(['a.txt', 'never-there.txt']);
      expect(await storage.head('a.txt')).toBeNull();
      expect(await storage.head('b.txt')).not.toBeNull();
      await expect(storage.delete([])).resolves.toBeUndefined();
      await expect(storage.delete(['a.txt'])).resolves.toBeUndefined();
    });

    it('says who deletes expired artifacts', () => {
      expect(['app', 'provider']).toContain(storage.retention);
      expect(storage.retention === 'provider' || storage.applyRetentionPolicy === undefined).toBe(true);
    });
  });
}
