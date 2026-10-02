import { describe, expect, test } from 'vitest';
import type { VisualDiffRegion } from '@miguelfranken/ui/lib/visual-diff';
import { parseSpecQuery, planImages, specQuery, type ImageRequest } from './image-plan';

const region = (label: string, x: number, y: number, width: number, height: number, pixels: number, kind: VisualDiffRegion['kind'] = 'change'): VisualDiffRegion => ({
  id: `r${x}-${y}-${width}-${height}`,
  label,
  kind,
  headRect: kind === 'removed-area' ? null : { x, y, width, height },
  baseRect: { x, y, width, height },
  rawChangedPixels: pixels,
  ignore: 'none',
  ignoredBy: [],
});

const base: ImageRequest = {
  mode: 'pair',
  scope: 'regions',
  regionIds: [],
  order: 'reading',
  crop: null,
  contextPadding: 24,
  maxImages: 3,
  captureScale: 2,
  sizes: { base: { width: 2000, height: 3000 }, head: { width: 2000, height: 3000 } },
};

describe('planImages', () => {
  test('an overview is one image, or two for a pair', () => {
    expect(planImages({ ...base, mode: 'annotated', scope: 'overview' }, []).images).toMatchObject([{ role: 'overview', mode: 'annotated', side: 'head', rect: null }]);
    expect(planImages({ ...base, scope: 'overview' }, []).images.map((i) => i.side)).toEqual(['base', 'head']);
  });

  test('regions come as padded pairs in reading order, within the budget; the rest are named', () => {
    const regions = [region('D1', 100, 100, 50, 20, 400), region('D2', 100, 500, 50, 20, 9000), region('D3', 100, 900, 50, 20, 10)];
    const plan = planImages(base, regions);
    // One pair fits whole in a budget of three; the second region would need two more.
    expect(plan.images.map((i) => [i.side, i.regionIds[0]])).toEqual([
      ['base', regions[0].id],
      ['head', regions[0].id],
    ]);
    // Padding is 24 CSS px × scale 2.
    expect(plan.images[0].rect).toEqual({ x: 52, y: 52, width: 146, height: 116 });
    expect(plan.nextRegionIds).toEqual([regions[1].id, regions[2].id]);
    const largest = planImages({ ...base, order: 'largest', maxImages: 2 }, regions);
    expect(largest.images[0].regionIds).toEqual([regions[1].id]);
  });

  test('regions can be picked by id or label, and a long region is tiled', () => {
    const regions = [region('D1', 0, 100, 2000, 30, 5000), region('D2', 10, 2000, 20, 20, 100)];
    const plan = planImages({ ...base, mode: 'head', regionIds: ['D1'], maxImages: 8 }, regions);
    expect(plan.images).toHaveLength(2);
    expect(plan.images.map((i) => i.tile)).toEqual([
      { n: 1, of: 2 },
      { n: 2, of: 2 },
    ]);
    expect(plan.images.every((i) => i.rect!.width <= 1024)).toBe(true);
    expect(planImages({ ...base, regionIds: ['nope'] }, regions).warnings[0]).toMatch(/No such region/);
  });

  test('a removed area is shown from the base only', () => {
    const plan = planImages(base, [region('D1', 0, 2900, 2000, 100, 200_000, 'removed-area')]);
    expect(plan.images.map((i) => i.side)).toEqual(['base', 'base']);
    expect(plan.images[0].label).toMatch(/only the base has/);
  });

  test('a crop is one rectangle in the space asked for', () => {
    const plan = planImages({ ...base, mode: 'highlight', scope: 'crop', crop: { x: 10, y: 20, width: 300, height: 200, space: 'head' } }, []);
    expect(plan.images).toMatchObject([{ role: 'crop', mode: 'highlight', side: 'head', rect: { x: 10, y: 20, width: 300, height: 200 } }]);
    expect(planImages({ ...base, scope: 'crop', crop: null }, []).warnings[0]).toMatch(/needs "crop"/);
  });

  test('a planned image survives the trip through a link’s query string', () => {
    const img = planImages({ ...base, mode: 'annotated', scope: 'crop', crop: { x: 1, y: 2, width: 30, height: 40, space: 'head' } }, []).images[0];
    const q = specQuery(img, { policy: 'effective', showIgnored: false, revision: 'r1-abc' });
    expect(parseSpecQuery(q)).toEqual({ mode: 'annotated', side: 'head', rect: { x: 1, y: 2, width: 30, height: 40 }, regionIds: [], policy: 'effective', showIgnored: false, revision: 'r1-abc' });
    expect(parseSpecQuery(new URLSearchParams('mode=pair&side=head'))).toBeNull();
    expect(parseSpecQuery(new URLSearchParams('mode=head&side=head&rect=1,2,0,4'))).toBeNull();
  });
});
