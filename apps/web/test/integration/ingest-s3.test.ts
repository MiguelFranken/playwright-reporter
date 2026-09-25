/**
 * The whole artifact path with `STORAGE_DRIVER=s3`, against the S3 stub: the
 * reporter asks for upload URLs, PUTs straight to the bucket and reports
 * back; the artifact route serves the object; retention and "force delete"
 * remove it from the bucket. The route handlers are called as plain
 * functions with real `Request`s, as in `ingest-http-boundary.test.ts`.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll } from 'vitest';
import type { UploadInstruction } from '@miguelfranken/protocol';
import { GET as artifactRoute } from '@/app/api/artifacts/[attachmentId]/route';
import { POST as postComplete } from '@/app/api/ingest/runs/[runId]/attachments/[attachmentId]/complete/route';
import { POST as postUploadUrls } from '@/app/api/ingest/runs/[runId]/attachments/upload-urls/route';
import { POST as postEvents } from '@/app/api/ingest/runs/[runId]/events/route';
import { POST as postRun } from '@/app/api/ingest/runs/route';
import { signArtifactPath } from '@/lib/auth/artifact-url';
import { attachments } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { evictAllArtifacts, saveRetentionPolicy, sweepExpiredArtifacts } from '@/lib/storage/retention';
import { attachmentRef, attemptEnd, runStart, testBegin } from './factories';
import { beforeEach, expect, test, type Db, type Tenant } from './fixtures';
import { bucketClient, describeS3, uniqueBucket, useS3Driver } from './s3';

const bucket = uniqueBucket();
const store = bucketClient(bucket);
useS3Driver(bucket);

const DAY = 86_400_000;

function ingestRequest(url: string, body: unknown, token: string) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });

/** A failed test with the given attachments, reported over the ingest API. */
async function runWithAttachments(token: string, refs: ReturnType<typeof attachmentRef>[]) {
  const started = await (await postRun(ingestRequest('http://test.local/api/ingest/runs', runStart(), token))).json();
  await postEvents(
    ingestRequest(
      `http://test.local/api/ingest/runs/${started.runId}/events`,
      {
        shardIndex: 1,
        events: [testBegin({ seq: 0, testKey: 'a' }), attemptEnd({ seq: 1, testKey: 'a', status: 'failed', outcome: 'unexpected', attachments: refs })],
      },
      token,
    ),
    params({ runId: started.runId }),
  );
  return started as { runId: string };
}

async function uploadUrls(token: string, runId: string, attachmentIds: string[]): Promise<UploadInstruction[]> {
  const res = await postUploadUrls(
    ingestRequest(`http://test.local/api/ingest/runs/${runId}/attachments/upload-urls`, { attachmentIds }, token),
    params({ runId }),
  );
  expect(res.status).toBe(200);
  return (await res.json()).uploads;
}

function complete(token: string, runId: string, attachmentId: string, size: number) {
  return postComplete(
    ingestRequest(`http://test.local/api/ingest/runs/${runId}/attachments/${attachmentId}/complete`, { size }, token),
    params({ runId, attachmentId }),
  );
}

/** The reporter's side of an upload (`packages/reporter/src/client.ts`): no token goes to a presigned URL. */
function reporterPut(instruction: UploadInstruction, body: Uint8Array, contentType: string) {
  return fetch(instruction.url, { method: instruction.method, headers: { 'content-type': contentType, ...instruction.headers }, body: new Blob([new Uint8Array(body)]) });
}

/** Reports, uploads and completes attachments the way a reporter run does. */
async function uploadedArtifacts(tenant: Tenant, specs: { name: string; contentType: string; body: Uint8Array }[]) {
  const refs = specs.map((s) => attachmentRef({ name: s.name, contentType: s.contentType, size: s.body.byteLength }));
  const { runId } = await runWithAttachments(tenant.token, refs);
  const instructions = await uploadUrls(
    tenant.token,
    runId,
    refs.map((r) => r.id),
  );
  for (const [i, ref] of refs.entries()) {
    const instruction = instructions.find((u) => u.attachmentId === ref.id)!;
    expect((await reporterPut(instruction, specs[i].body, ref.contentType)).status).toBe(200);
    expect(await (await complete(tenant.token, runId, ref.id, specs[i].body.byteLength)).json()).toEqual({ ok: true });
  }
  return { runId, refs };
}

async function row(db: Db, id: string) {
  const [r] = await db.select().from(attachments).where(eq(attachments.id, id));
  return r;
}

function artifactGet(attachmentId: string, headers: Record<string, string> = {}, query = '') {
  return artifactRoute(new Request(`http://test.local${signArtifactPath(attachmentId)}${query}`, { headers }), params({ attachmentId }));
}

const text = (s: string) => new TextEncoder().encode(s);

describeS3('ingest with STORAGE_DRIVER=s3', () => {
  beforeAll(async () => {
    await store.create();
  });
  beforeEach(async () => {
    await store.empty();
  });
  afterAll(async () => {
    await store.empty();
  });

  test('the app runs on the S3 adapter', () => {
    expect(getStorage()).toMatchObject({ name: 's3', bucket, retention: 'app' });
  });

  test('hands out presigned uploads that land in the bucket, and trusts only the bucket', async ({ db, tenant }) => {
    const ref = attachmentRef({ name: 'screenshot.png', contentType: 'image/png', size: 999 });
    const { runId } = await runWithAttachments(tenant.token, [ref]);
    const [instruction] = await uploadUrls(tenant.token, runId, [ref.id]);
    expect(instruction).toMatchObject({ attachmentId: ref.id, strategy: 'presigned', method: 'PUT', headers: { 'content-type': 'image/png' } });
    expect(instruction.url.startsWith(`${process.env.S3_ENDPOINT}/${bucket}/projects/${tenant.project.id}/runs/${runId}/`)).toBe(true);

    // Reported done before the bytes are there: stays pending.
    expect((await complete(tenant.token, runId, ref.id, 999)).status).toBe(409);
    expect((await row(db, ref.id)).status).toBe('pending');

    expect((await reporterPut(instruction, new Uint8Array(1234).fill(3), 'image/png')).status).toBe(200);
    expect(await (await complete(tenant.token, runId, ref.id, 999)).json()).toEqual({ ok: true });

    const stored = await row(db, ref.id);
    // The size the bucket reports, not the one the reporter claimed.
    expect(stored).toMatchObject({ status: 'uploaded', sizeBytes: 1234, storageDriver: 's3' });
    expect(await store.listKeys()).toEqual([stored.storageKey]);
    expect(await store.head(stored.storageKey)).toEqual({ size: 1234, contentType: 'image/png' });
  });

  test('media the browser plays is read from a presigned URL, other kinds through the app', async ({ tenant }) => {
    const { refs } = await uploadedArtifacts(tenant, [
      { name: 'screenshot.png', contentType: 'image/png', body: text('PNGDATA') },
      { name: 'trace.zip', contentType: 'application/zip', body: text('0123456789') },
    ]);
    const [screenshot, trace] = refs;

    const redirect = await artifactGet(screenshot.id);
    expect(redirect.status).toBe(302);
    const location = redirect.headers.get('location')!;
    expect(location.startsWith(`${process.env.S3_ENDPOINT}/${bucket}/`)).toBe(true);
    const direct = await fetch(location);
    expect(direct.headers.get('content-type')).toBe('image/png');
    expect(await direct.text()).toBe('PNGDATA');

    // The trace viewer needs this app's CORS headers, so a trace streams through it.
    const whole = await artifactGet(trace.id);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-length')).toBe('10');
    expect(await whole.text()).toBe('0123456789');

    const part = await artifactGet(trace.id, { range: 'bytes=2-4' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(await part.text()).toBe('234');

    // A download keeps its file name, so it streams through the app too.
    const download = await artifactGet(screenshot.id, {}, '&download');
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(await download.text()).toBe('PNGDATA');
  });

  test('the retention sweep deletes expired objects from the bucket', async ({ db, tenant }) => {
    const { refs } = await uploadedArtifacts(tenant, [
      { name: 'old-video.webm', contentType: 'video/webm', body: text('old') },
      { name: 'new-video.webm', contentType: 'video/webm', body: text('new') },
    ]);
    const [old, fresh] = refs;
    await db
      .update(attachments)
      .set({ createdAt: new Date(Date.now() - 40 * DAY) })
      .where(eq(attachments.id, old.id));
    await saveRetentionPolicy({ enabled: true, days: 30, overrides: {} }, tenant.adminUser.id);

    expect(await sweepExpiredArtifacts({ trigger: 'manual' })).toMatchObject({ status: 'done', expiredCount: 1, error: null });

    const [oldRow, freshRow] = [await row(db, old.id), await row(db, fresh.id)];
    expect(oldRow.status).toBe('expired');
    expect(freshRow.status).toBe('uploaded');
    expect(await store.exists(oldRow.storageKey)).toBe(false);
    expect(await store.exists(freshRow.storageKey)).toBe(true);
    expect((await artifactGet(old.id)).status).toBe(410);
  });

  test('"force delete" empties the bucket of every artifact', async ({ db, tenant }) => {
    const { refs } = await uploadedArtifacts(tenant, [
      { name: 'a.png', contentType: 'image/png', body: text('a') },
      { name: 'b.zip', contentType: 'application/zip', body: text('b') },
    ]);
    await store.put('avatars/users/u/1.png', 'avatar', 'image/png');

    expect(await evictAllArtifacts()).toMatchObject({ expiredCount: 2, error: null });
    expect(await store.listKeys()).toEqual(['avatars/users/u/1.png']);
    for (const ref of refs) expect((await row(db, ref.id)).status).toBe('expired');
  });
});
