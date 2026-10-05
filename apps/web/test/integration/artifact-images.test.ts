/**
 * Screenshots at the width they are shown: the image route resizes an
 * original once, keeps the copy beside it in the store, hands the original
 * back for a width it already fits in, answers only whoever may read the
 * artifact, and the retention sweep deletes the copies with their original.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { vi } from 'vitest';
import { GET as imageRoute } from '@/app/api/artifacts/[attachmentId]/image/route';
import { variantKey } from '@/lib/artifacts/image-variants';
import { attachments, type Attachment } from '@/lib/db/schema';
import { getAttachmentForProject, storeUpload } from '@/lib/ingest/service';
import { saveRetentionPolicy, sweepExpiredArtifacts } from '@/lib/storage/retention';
import { attachmentRef, playRun } from './factories';
import { describe, expect, test, type Db, type Tenant } from './fixtures';

// The copy is stored in `after()`, which needs a request scope; run it here and let the request wait for it.
const pending = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
  after: (task: () => unknown) => void pending.push(Promise.resolve().then(task)),
}));

const DAY = 86_400_000;

async function screenshot(db: Db, tenant: Tenant, size = { width: 1200, height: 3000 }, ageDays = 0): Promise<Attachment> {
  const ref = attachmentRef({ name: 'screenshot', contentType: 'image/png' });
  await playRun(tenant.tokenProject, { tests: [{ outcome: 'failed', attachments: [ref] }] });
  const row = await getAttachmentForProject(tenant.tokenProject, ref.id);
  const png = await sharp({ create: { ...size, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();
  await storeUpload(row, new Blob([new Uint8Array(png)]).stream(), 'image/png');
  const [aged] = await db
    .update(attachments)
    .set({ createdAt: new Date(Date.now() - ageDays * DAY) })
    .where(eq(attachments.id, row.id))
    .returning();
  return aged;
}

async function fetchImage(id: string, query: string) {
  const response = await imageRoute(new Request(`http://test.local/api/artifacts/${id}/image?${query}`), { params: Promise.resolve({ attachmentId: id }) });
  await Promise.all(pending.splice(0));
  return response;
}
const exists = (root: string, key: string) =>
  access(path.join(root, key)).then(
    () => true,
    () => false,
  );

describe('image variants', () => {
  test('resizes once, then reads the stored copy', async ({ db, tenant, actor, storage }) => {
    actor.signIn(tenant.adminUser);
    const shot = await screenshot(db, tenant);

    const first = await fetchImage(shot.id, 'w=300');
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('image/webp');
    expect(first.headers.get('cache-control')).toContain('private');
    const meta = await sharp(Buffer.from(await first.arrayBuffer())).metadata();
    // 300 asks for the next offered width.
    expect(meta).toMatchObject({ format: 'webp', width: 384, height: 960 });
    expect(await exists(storage, variantKey(shot.storageKey, 384))).toBe(true);

    const again = await fetchImage(shot.id, 'w=384');
    expect(again.status).toBe(200);
    expect(again.headers.get('content-length')).toBe(first.headers.get('content-length'));
  });

  test('sends the original for a width it already fits in', async ({ db, tenant, actor }) => {
    actor.signIn(tenant.adminUser);
    const shot = await screenshot(db, tenant, { width: 600, height: 400 });
    const response = await fetchImage(shot.id, 'w=1080');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`/api/artifacts/${shot.id}`);
  });

  test('answers only whoever may read the artifact', async ({ db, tenant, actor }) => {
    const shot = await screenshot(db, tenant);
    actor.signIn(null);
    expect((await fetchImage(shot.id, 'w=384')).status).toBe(404);
    expect((await fetchImage('not-an-id', 'w=384')).status).toBe(404);
  });

  test('the retention sweep deletes the copies with their original', async ({ db, tenant, actor, storage }) => {
    actor.signIn(tenant.adminUser);
    const shot = await screenshot(db, tenant, undefined, 10);
    await fetchImage(shot.id, 'w=640');
    expect(await exists(storage, variantKey(shot.storageKey, 640))).toBe(true);

    await saveRetentionPolicy({ enabled: true, days: 7, overrides: {}, keepVisuals: true }, tenant.adminUser.id);
    await sweepExpiredArtifacts({ trigger: 'cron' });
    expect(await exists(storage, shot.storageKey)).toBe(false);
    expect(await exists(storage, variantKey(shot.storageKey, 640))).toBe(false);
    expect((await fetchImage(shot.id, 'w=640')).status).toBe(410);
  });
});
