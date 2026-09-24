import { beforeAll, describe, expect, it } from 'vitest';
import { artifactSignature, signArtifactPath, verifyArtifactSignature } from './artifact-url';

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-for-artifact-urls-0123456789';
});

function parse(query: string) {
  const params = new URLSearchParams(query);
  return { exp: params.get('exp'), sig: params.get('sig') };
}

describe('signed artifact URLs', () => {
  const id = '11111111-2222-3333-4444-555555555555';

  it('verifies a freshly signed URL', () => {
    const { exp, sig } = parse(artifactSignature(id));
    expect(verifyArtifactSignature(id, exp, sig)).toBe(true);
  });

  it('rejects a signature made for another attachment', () => {
    const { exp, sig } = parse(artifactSignature(id));
    expect(verifyArtifactSignature('99999999-2222-3333-4444-555555555555', exp, sig)).toBe(false);
  });

  it('rejects a tampered expiry', () => {
    const { exp, sig } = parse(artifactSignature(id));
    expect(verifyArtifactSignature(id, String(Number(exp) + 3600), sig)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const { exp, sig } = parse(artifactSignature(id));
    expect(verifyArtifactSignature(id, exp, `${sig!.slice(0, -1)}${sig!.at(-1) === 'A' ? 'B' : 'A'}`)).toBe(false);
  });

  it('rejects an expired signature', () => {
    const { exp, sig } = parse(artifactSignature(id, -60));
    expect(Number(exp)).toBeLessThan(Date.now() / 1000);
    expect(verifyArtifactSignature(id, exp, sig)).toBe(false);
  });

  it('rejects missing or malformed parameters', () => {
    expect(verifyArtifactSignature(id, null, null)).toBe(false);
    expect(verifyArtifactSignature(id, 'not-a-number', 'x')).toBe(false);
    expect(verifyArtifactSignature(id, String(Math.floor(Date.now() / 1000) + 60), '')).toBe(false);
  });

  it('builds a same-origin path the route handler can read', () => {
    const path = signArtifactPath(id);
    expect(path.startsWith(`/api/artifacts/${id}?`)).toBe(true);
    const { exp, sig } = parse(path.split('?')[1]);
    expect(verifyArtifactSignature(id, exp, sig)).toBe(true);
  });
});
