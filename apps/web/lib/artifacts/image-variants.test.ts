import { describe, expect, test } from 'vitest';
import { imageVariantUrl, isArtifactImageUrl, snapWidth, variantKey, variantKeys, IMAGE_WIDTHS } from './image-variants';

describe('image variants', () => {
  test('snaps a requested width up to an offered one', () => {
    expect(snapWidth(1)).toBe(96);
    expect(snapWidth(300)).toBe(384);
    expect(snapWidth(1280)).toBe(1280);
    expect(snapWidth(99_999)).toBe(3840);
    expect(snapWidth(Number.NaN)).toBe(96);
  });

  test('builds the variant URL of an artifact, keeping a signature', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(imageVariantUrl(`/api/artifacts/${id}`, 500)).toBe(`/api/artifacts/${id}/image?w=640`);
    expect(imageVariantUrl(`/api/artifacts/${id}?exp=1&sig=abc`, 100)).toBe(`/api/artifacts/${id}/image?exp=1&sig=abc&w=160`);
    expect(isArtifactImageUrl(`/api/artifacts/${id}`)).toBe(true);
    expect(isArtifactImageUrl('/fixtures/a.png')).toBe(false);
  });

  test('stores each width beside its original', () => {
    expect(variantKey('projects/p/runs/r/a.png', 640)).toBe('projects/p/runs/r/a.png.w640.webp');
    expect(variantKeys('k')).toHaveLength(IMAGE_WIDTHS.length);
  });
});
