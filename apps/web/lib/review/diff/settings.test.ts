import { describe, expect, test } from 'vitest';
import { DEFAULT_VISUAL_DIFF, optionsKey, toleranceComment, visualDiffSettings, withinTolerance } from './settings';

describe('visualDiffSettings', () => {
  test('defaults approve only what has no visible change', () => {
    expect(visualDiffSettings({})).toEqual(DEFAULT_VISUAL_DIFF);
    expect(visualDiffSettings(null)).toEqual({ threshold: 0.1, autoApprove: true, maxChangedPixels: 0, maxChangedPercent: 0 });
  });

  test('clamps what a project stored', () => {
    expect(visualDiffSettings({ visualDiff: { threshold: 2, maxChangedPixels: -3, maxChangedPercent: '9', autoApprove: 'yes' } })).toEqual({
      threshold: 0.5,
      autoApprove: true,
      maxChangedPixels: 0,
      maxChangedPercent: 5,
    });
  });
});

describe('withinTolerance', () => {
  const s = { ...DEFAULT_VISUAL_DIFF, maxChangedPixels: 10, maxChangedPercent: 0.1 };
  test('by pixels or by share; never when the size changed', () => {
    expect(withinTolerance({ changedPixels: 0, ratio: 0, sizeChanged: false }, DEFAULT_VISUAL_DIFF)).toBe(true);
    expect(withinTolerance({ changedPixels: 1, ratio: 0.0000001, sizeChanged: false }, DEFAULT_VISUAL_DIFF)).toBe(false);
    expect(withinTolerance({ changedPixels: 10, ratio: 0.5, sizeChanged: false }, s)).toBe(true);
    expect(withinTolerance({ changedPixels: 500, ratio: 0.0009, sizeChanged: false }, s)).toBe(true);
    expect(withinTolerance({ changedPixels: 500, ratio: 0.002, sizeChanged: false }, s)).toBe(false);
    expect(withinTolerance({ changedPixels: 0, ratio: 0, sizeChanged: true }, s)).toBe(false);
  });
});

describe('optionsKey', () => {
  test('changes with the threshold and the ignored areas, not their order', () => {
    const a = { x: 0, y: 0, width: 5, height: 5 };
    const b = { x: 10, y: 20, width: 5, height: 5 };
    expect(optionsKey(0.1)).not.toBe(optionsKey(0.2));
    expect(optionsKey(0.1, [a])).not.toBe(optionsKey(0.1));
    expect(optionsKey(0.1, [a, b])).toBe(optionsKey(0.1, [b, a]));
  });
});

test('the tolerance decision says why', () => {
  expect(toleranceComment({ changedPixels: 0, ratio: 0 }, 470)).toBe("Within the project's diff tolerance: no visible change against the approved image of run #470.");
  expect(toleranceComment({ changedPixels: 12, ratio: 0.00001 }, null)).toMatch(/12 changed pixels \(< 0.01%\)/);
});
