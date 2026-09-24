import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { avatarKey, avatarUrl, displayableAvatar, parseAvatarUrl, sniffImageType } from './index';

const header = (...bytes: number[]) => new Uint8Array([...bytes, 0, 0, 0, 0]);

describe('sniffImageType', () => {
  it.for([
    { type: 'image/png', bytes: header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
    { type: 'image/jpeg', bytes: header(0xff, 0xd8, 0xff, 0xe0) },
    { type: 'image/gif', bytes: header(0x47, 0x49, 0x46, 0x38, 0x39, 0x61) },
    { type: 'image/webp', bytes: header(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50) },
  ])('recognizes $type', ({ type, bytes }) => {
    expect(sniffImageType(bytes)).toBe(type);
  });

  it.for([
    { name: 'SVG', text: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
    { name: 'HTML', text: '<!doctype html><script>alert(1)</script>' },
    { name: 'a RIFF file that is not WebP', text: 'RIFF\u0000\u0000\u0000\u0000WAVE' },
    { name: 'an empty file', text: '' },
  ])('rejects $name', ({ text }) => {
    expect(sniffImageType(new TextEncoder().encode(text))).toBeNull();
  });
});

describe('avatar URLs', () => {
  const ref = { kind: 'users' as const, ownerId: randomUUID(), avatarId: randomUUID() };

  it('round-trips through the URL and keys the store by owner', () => {
    const url = avatarUrl(ref);
    expect(url).toBe(`/api/avatars/users/${ref.ownerId}/${ref.avatarId}`);
    expect(parseAvatarUrl(url)).toEqual(ref);
    expect(avatarKey(ref)).toBe(`avatars/users/${ref.ownerId}/${ref.avatarId}`);
  });

  it.for([
    { name: 'a third-party URL', url: 'https://tracker.example/pixel.gif' },
    { name: 'an unknown kind', url: `/api/avatars/projects/${randomUUID()}/${randomUUID()}` },
    { name: 'a non-uuid id', url: `/api/avatars/users/${randomUUID()}/..` },
    { name: 'extra segments', url: `/api/avatars/teams/${randomUUID()}/${randomUUID()}/x` },
    { name: 'nothing', url: null },
  ])('refuses $name', ({ url }) => {
    expect(parseAvatarUrl(url)).toBeNull();
    expect(displayableAvatar(url)).toBeNull();
  });
});
