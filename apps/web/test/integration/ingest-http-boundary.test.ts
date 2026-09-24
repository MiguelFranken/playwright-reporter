/**
 * 8.4 — the ingest route handlers, invoked as plain functions with a real
 * `Request`. This is the boundary a reporter actually talks to: bearer auth,
 * gzip, size limits, schema errors and the proxy upload path.
 */
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { PROTOCOL_HEADER } from '@repo/protocol';
import { POST as postRun } from '@/app/api/ingest/runs/route';
import { POST as postEvents } from '@/app/api/ingest/runs/[runId]/events/route';
import { POST as postFinish } from '@/app/api/ingest/runs/[runId]/finish/route';
import { POST as postUploadUrls } from '@/app/api/ingest/runs/[runId]/attachments/upload-urls/route';
import { POST as postComplete } from '@/app/api/ingest/runs/[runId]/attachments/[attachmentId]/complete/route';
import { PUT as putUpload } from '@/app/api/ingest/uploads/[attachmentId]/route';
import { apiTokens, attachments, runs } from '@/lib/db/schema';
import { attachmentRef, attemptEnd, runStart, testBegin } from './factories';
import { createTenant, describe, expect, test, vi } from './fixtures';

function ingestRequest(url: string, body: unknown, opts: { token?: string | null; headers?: Record<string, string>; gzip?: boolean } = {}) {
  const headers = new Headers({ 'content-type': 'application/json', ...opts.headers });
  if (opts.token !== null) headers.set('authorization', `Bearer ${opts.token}`);
  const json = JSON.stringify(body);
  if (opts.gzip) {
    headers.set('content-encoding', 'gzip');
    return new Request(url, { method: 'POST', headers, body: new Uint8Array(gzipSync(json)) });
  }
  return new Request(url, { method: 'POST', headers, body: json });
}

const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });

describe('POST /api/ingest/runs', () => {
  test('creates a run and answers 201 with its location', async ({ tenant }) => {
    const response = await postRun(
      ingestRequest('http://test.local/api/ingest/runs', runStart({ ciRunId: 'build-1' }), { token: tenant.token }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ runNumber: 1, shardIndex: 1 });
    expect(body.url).toBe(`http://test.local/teams/${tenant.team.slug}/projects/${tenant.project.slug}/runs/1`);
    expect(body.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test.for([
    { name: 'no authorization header', token: null, status: 401 },
    { name: 'an unknown token', token: 'pwr_not-a-real-token', status: 401 },
    { name: 'an empty bearer value', token: '', status: 401 },
  ])('rejects $name with $status', async ({ token, status }, { tenant }) => {
    void tenant;
    const response = await postRun(ingestRequest('http://test.local/api/ingest/runs', runStart(), { token }));
    expect(response.status).toBe(status);
  });

  test('rejects a revoked token', async ({ db, tenant }) => {
    await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.projectId, tenant.project.id));
    const response = await postRun(ingestRequest('http://test.local/api/ingest/runs', runStart(), { token: tenant.token }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid token' });
  });

  test("rejects another project's token for this project's data", async ({ db, tenant }) => {
    const other = await createTenant(db);
    const created = await postRun(ingestRequest('http://test.local/api/ingest/runs', runStart(), { token: other.token }));
    const { runId } = await created.json();

    // The run exists, but not under the first tenant's token.
    const response = await postEvents(
      ingestRequest(`http://test.local/api/ingest/runs/${runId}/events`, { shardIndex: 1, events: [] }, { token: tenant.token }),
      params({ runId }),
    );
    expect(response.status).toBe(404);
  });

  test('refuses a newer protocol version with 426', async ({ tenant }) => {
    const response = await postRun(
      ingestRequest('http://test.local/api/ingest/runs', runStart(), { token: tenant.token, headers: { [PROTOCOL_HEADER]: '2' } }),
    );
    expect(response.status).toBe(426);
    expect((await response.json()).error).toContain('unsupported protocol version 2');
  });

  test('accepts the protocol version it speaks', async ({ tenant }) => {
    const response = await postRun(
      ingestRequest('http://test.local/api/ingest/runs', runStart(), { token: tenant.token, headers: { [PROTOCOL_HEADER]: '1' } }),
    );
    expect(response.status).toBe(201);
  });

  test('updates last_used_at on the token that authenticated', async ({ db, tenant }) => {
    const before = (await db.select().from(apiTokens))[0];
    expect(before.lastUsedAt).toBeNull();

    await postRun(ingestRequest('http://test.local/api/ingest/runs', runStart(), { token: tenant.token }));

    // Bookkeeping is fire-and-forget, so it lands shortly after the response.
    await vi.waitFor(async () => {
      const [row] = await db.select().from(apiTokens);
      expect(row.lastUsedAt).not.toBeNull();
    });
  });
});

describe('request bodies', () => {
  test('accepts a gzip-encoded body', async ({ db, tenant }) => {
    const response = await postRun(
      ingestRequest('http://test.local/api/ingest/runs', runStart({ ciRunId: 'gzipped' }), { token: tenant.token, gzip: true }),
    );
    expect(response.status).toBe(201);
    const [row] = await db.select().from(runs);
    expect(row.ciRunId).toBe('gzipped');
  });

  test('answers 413 above INGEST_MAX_BATCH_BYTES', async ({ tenant }) => {
    const huge = runStart({ ciRunId: 'x'.repeat(200), tags: Array.from({ length: 50 }, () => 'y'.repeat(100)) });
    // The limit is read at module load; shrink the payload budget instead of the env.
    const body = JSON.stringify({ ...huge, padding: 'z'.repeat(5 * 1024 * 1024) });
    const request = new Request('http://test.local/api/ingest/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tenant.token}` },
      body,
    });
    const response = await postRun(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'payload too large' });
  });

  test('answers 400 with the offending path for a schema violation', async ({ tenant }) => {
    const response = await postRun(
      ingestRequest('http://test.local/api/ingest/runs', { ...runStart(), expectedTests: 'lots' }, { token: tenant.token }),
    );
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error).toContain('invalid payload');
    expect(error).toContain('expectedTests');
  });

  test('answers 400 for a body that is not JSON', async ({ tenant }) => {
    const request = () =>
      new Request('http://test.local/api/ingest/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tenant.token}` },
        body: 'not json at all',
      });
    const response = await postRun(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid json' });
  });
});

describe('the whole reporter conversation', () => {
  test('start → events → finish leaves a finished run', async ({ db, tenant }) => {
    const started = await (
      await postRun(ingestRequest('http://test.local/api/ingest/runs', runStart({ ciRunId: 'build-1' }), { token: tenant.token }))
    ).json();

    const events = await postEvents(
      ingestRequest(
        `http://test.local/api/ingest/runs/${started.runId}/events`,
        {
          shardIndex: 1,
          events: [testBegin({ seq: 0, testKey: 'a' }), attemptEnd({ seq: 1, testKey: 'a', status: 'passed' })],
        },
        { token: tenant.token },
      ),
      params({ runId: started.runId }),
    );
    expect(await events.json()).toEqual({ accepted: 2, lastSeq: 1 });

    const finish = await postFinish(
      ingestRequest(
        `http://test.local/api/ingest/runs/${started.runId}/finish`,
        { shardIndex: 1, status: 'passed', durationMs: 1000, finishedAt: new Date().toISOString() },
        { token: tenant.token },
      ),
      params({ runId: started.runId }),
    );
    expect(await finish.json()).toMatchObject({ runStatus: 'passed' });

    const [row] = await db.select().from(runs);
    expect(row.status).toBe('passed');
  });

  test('a run id that does not exist is a 404', async ({ tenant }) => {
    const runId = '00000000-0000-4000-8000-000000000000';
    const response = await postEvents(
      ingestRequest(`http://test.local/api/ingest/runs/${runId}/events`, { shardIndex: 1, events: [] }, { token: tenant.token }),
      params({ runId }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'run not found' });
  });
});

describe('attachment upload', () => {
  async function runWithAttachment(token: string) {
    const started = await (
      await postRun(ingestRequest('http://test.local/api/ingest/runs', runStart(), { token }))
    ).json();
    const ref = attachmentRef({ name: 'screenshot.png', contentType: 'image/png', size: 5 });
    await postEvents(
      ingestRequest(
        `http://test.local/api/ingest/runs/${started.runId}/events`,
        {
          shardIndex: 1,
          events: [
            testBegin({ seq: 0, testKey: 'a' }),
            attemptEnd({ seq: 1, testKey: 'a', status: 'failed', outcome: 'unexpected', attachments: [ref] }),
          ],
        },
        { token },
      ),
      params({ runId: started.runId }),
    );
    return { started, ref };
  }

  test('hands out proxy instructions pointing back at this app', async ({ db, tenant }) => {
    const { started, ref } = await runWithAttachment(tenant.token);

    const response = await postUploadUrls(
      ingestRequest(
        `http://test.local/api/ingest/runs/${started.runId}/attachments/upload-urls`,
        { attachmentIds: [ref.id] },
        { token: tenant.token },
      ),
      params({ runId: started.runId }),
    );
    const { uploads } = await response.json();
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      attachmentId: ref.id,
      strategy: 'proxy',
      method: 'PUT',
      url: `http://test.local/api/ingest/uploads/${ref.id}`,
      headers: { 'content-type': 'image/png' },
    });

    const [row] = await db.select().from(attachments);
    expect(row).toMatchObject({ id: ref.id, kind: 'screenshot', status: 'pending', storageDriver: 'local' });
    expect(row.storageKey).toContain(`projects/${tenant.project.id}/runs/${started.runId}/`);
    expect(row.storageKey.endsWith(`${ref.id}-screenshot.png`)).toBe(true);
  });

  test('PUT writes the bytes to disk and marks the row uploaded with the real size', async ({ db, tenant, storage }) => {
    const { ref } = await runWithAttachment(tenant.token);
    const bytes = new Uint8Array([137, 80, 78, 71, 13]);

    const response = await putUpload(
      new Request(`http://test.local/api/ingest/uploads/${ref.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png', authorization: `Bearer ${tenant.token}` },
        body: bytes,
        // @ts-expect-error -- undici needs this for a stream body
        duplex: 'half',
      }),
      params({ attachmentId: ref.id }),
    );
    expect(await response.json()).toEqual({ ok: true, size: 5 });

    const [row] = await db.select().from(attachments);
    expect(row).toMatchObject({ status: 'uploaded', sizeBytes: 5 });
    expect(await readFile(path.join(storage, row.storageKey))).toEqual(Buffer.from(bytes));
    const meta = JSON.parse(await readFile(path.join(storage, `${row.storageKey}.meta.json`), 'utf8'));
    expect(meta).toEqual({ contentType: 'image/png', size: 5 });
  });

  test("an attachment from another project's run is a 404", async ({ db, tenant }) => {
    const other = await createTenant(db);
    const { ref } = await runWithAttachment(other.token);

    const response = await putUpload(
      new Request(`http://test.local/api/ingest/uploads/${ref.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png', authorization: `Bearer ${tenant.token}` },
        body: new Uint8Array([1]),
        // @ts-expect-error -- undici needs this for a stream body
        duplex: 'half',
      }),
      params({ attachmentId: ref.id }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'attachment not found' });

    const [row] = await db.select().from(attachments).where(eq(attachments.id, ref.id));
    expect(row.status).toBe('pending');
  });

  test('the complete endpoint marks a presigned upload done with its reported size', async ({ db, tenant }) => {
    const { started, ref } = await runWithAttachment(tenant.token);

    const response = await postComplete(
      ingestRequest(
        `http://test.local/api/ingest/runs/${started.runId}/attachments/${ref.id}/complete`,
        { size: 4242 },
        { token: tenant.token },
      ),
      params({ runId: started.runId, attachmentId: ref.id }),
    );
    expect(await response.json()).toEqual({ ok: true });

    const [row] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, ref.id), eq(attachments.status, 'uploaded')));
    expect(row.sizeBytes).toBe(4242);
  });
});
