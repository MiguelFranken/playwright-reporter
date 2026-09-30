import { describe, expect, it } from 'vitest';
import { branchHref, toRunHeaderData } from './index';

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

describe('toRunHeaderData', () => {
  const row = { gitRepoUrl: 'https://github.com/a/b', gitSha: 'abcdef1234', gitShortSha: null };

  it('reads the working tree and the executor source from the stored metadata', () => {
    const data = toRunHeaderData({ ...row, git: { dirty: true, dirtyFiles: 3 }, ci: { detectedBy: 'ci-env' as const } });
    expect(data).toMatchObject({ gitShortSha: 'abcdef1', gitDirty: true, gitDirtyFiles: 3, executorDetectedBy: 'ci-env' });
  });

  it('leaves them unknown for a run from an older reporter', () => {
    expect(toRunHeaderData({ ...row, git: {}, ci: {} })).toMatchObject({ gitDirty: null, gitDirtyFiles: null, executorDetectedBy: null });
  });
});
