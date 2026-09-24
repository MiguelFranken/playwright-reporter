import { describe, expect, it } from 'vitest';
import { branchHref } from './index';

const BASE = '/teams/t/projects/p';

describe('branchHref', () => {
  it('keeps the slashes of a branch name as path segments', () => {
    expect(branchHref(BASE, 'feature/checkout/cart')).toBe(`${BASE}/branches/feature/checkout/cart`);
  });

  it('encodes what would otherwise end the path or be read as an escape', () => {
    expect(branchHref(BASE, 'fix/#12?x=100%')).toBe(`${BASE}/branches/fix/%2312%3Fx%3D100%25`);
  });

  // The catch-all route splits the path on `/` and decodes each segment; joining them must give the name back.
  it('round-trips through the per-segment decoding the catch-all route applies', () => {
    for (const name of ['main', 'feature/ümlaut café', 'release/1.2+hotfix', 'a/b%2Fc']) {
      const path = branchHref(BASE, name).slice(`${BASE}/branches/`.length);
      expect(path.split('/').map(decodeURIComponent).join('/')).toBe(name);
    }
  });
});
