import { beforeEach, describe, expect, it, vi } from 'vitest';

const del = vi.fn(async (_keys: string[], _opts?: object) => undefined);
vi.mock('@vercel/blob', () => ({
  del: (keys: string[], opts?: object) => del(keys, opts),
  get: vi.fn(),
  head: vi.fn(),
  issueSignedToken: vi.fn(),
  parseStoreIdFromDelegationToken: vi.fn(),
  presignUrl: vi.fn(),
  put: vi.fn(),
}));

const { VercelBlobStorageAdapter } = await import('./vercel-blob');

beforeEach(() => del.mockClear());

describe('VercelBlobStorageAdapter', () => {
  it('owns retention itself: Blob has no lifecycle rules', () => {
    expect(new VercelBlobStorageAdapter('tok').retention).toBe('app');
  });

  it('deletes by pathname, in chunks of 100, with its token', async () => {
    const keys = Array.from({ length: 250 }, (_, i) => `projects/p/runs/r/attempts/a/${i}.png`);
    await new VercelBlobStorageAdapter('tok').delete(keys);
    expect(del.mock.calls.map(([k]) => k.length)).toEqual([100, 100, 50]);
    expect(del.mock.calls.flatMap(([k]) => k)).toEqual(keys);
    expect(del.mock.calls[0][1]).toEqual({ token: 'tok' });
  });

  it('makes no call for nothing', async () => {
    await new VercelBlobStorageAdapter().delete([]);
    expect(del).not.toHaveBeenCalled();
  });
});
