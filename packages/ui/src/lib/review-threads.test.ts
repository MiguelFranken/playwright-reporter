import { describe, expect, it } from 'vitest';
import { anchorFromDrag, closeUpWindow, describeAnchor, isFractionAnchor, projectAnchor, sortThreads, threadStage, toPixels } from './review-threads';

describe('projectAnchor', () => {
  it('turns pixels into fractions of the same image', () => {
    expect(projectAnchor({ kind: 'point', x: 640, y: 1000 }, { width: 1280, height: 4000 })).toEqual({ kind: 'point', x: 0.5, y: 0.25, w: null, h: null });
  });

  it('keeps a pin at its distance from the top when a full page grows', () => {
    const a = projectAnchor({ kind: 'point', x: 640, y: 1000 }, { width: 1280, height: 4000 }, { width: 1280, height: 5000 });
    expect(a.y).toBeCloseTo(0.2);
  });

  it('scales by the widths when the density changes', () => {
    const a = projectAnchor({ kind: 'area', x: 100, y: 200, w: 300, h: 100 }, { width: 1280, height: 720 }, { width: 2560, height: 1440 });
    expect(a).toEqual({ kind: 'area', x: 100 / 1280, y: 200 / 720, w: 300 / 1280, h: 100 / 720 });
  });

  it('clamps an anchor that falls outside a shorter image', () => {
    const a = projectAnchor({ kind: 'point', x: 10, y: 3900 }, { width: 1280, height: 4000 }, { width: 1280, height: 2000 });
    expect(a.y).toBe(1);
  });

  it('keeps an image anchor at the origin', () => {
    expect(projectAnchor({ kind: 'image', x: 5, y: 5 }, { width: 10, height: 10 })).toEqual({ kind: 'image', x: 0, y: 0, w: null, h: null });
  });
});

describe('toPixels', () => {
  it('round-trips with projectAnchor', () => {
    const size = { width: 1280, height: 4000 };
    expect(toPixels(projectAnchor({ kind: 'area', x: 120, y: 1400, w: 640, h: 220 }, size), size)).toEqual({ kind: 'area', x: 120, y: 1400, w: 640, h: 220 });
  });
});

describe('anchorFromDrag', () => {
  it('is a point for a click', () => {
    expect(anchorFromDrag({ x: 0.3, y: 0.4 }, { x: 0.302, y: 0.401 })).toMatchObject({ kind: 'point', x: 0.3, y: 0.4 });
  });

  it('is an area from any corner', () => {
    expect(anchorFromDrag({ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.3 })).toMatchObject({ kind: 'area', x: 0.2, y: 0.3 });
  });
});

describe('isFractionAnchor', () => {
  it('accepts points, areas and whole-image anchors', () => {
    expect(isFractionAnchor({ kind: 'point', x: 0.1, y: 0.9 })).toBe(true);
    expect(isFractionAnchor({ kind: 'area', x: 0.1, y: 0.1, w: 0.2, h: 0.2 })).toBe(true);
    expect(isFractionAnchor({ kind: 'image', x: 0, y: 0 })).toBe(true);
  });

  it('rejects what is outside the image or not a number', () => {
    expect(isFractionAnchor({ kind: 'point', x: 1.2, y: 0 })).toBe(false);
    expect(isFractionAnchor({ kind: 'point', x: Number.NaN, y: 0 })).toBe(false);
    expect(isFractionAnchor({ kind: 'area', x: 0, y: 0, w: 0, h: 0.1 })).toBe(false);
    expect(isFractionAnchor({ kind: 'circle', x: 0, y: 0 })).toBe(false);
  });
});

it('describes anchors in words', () => {
  expect(describeAnchor({ kind: 'point', x: 412.4, y: 880 })).toBe('(412, 880)');
  expect(describeAnchor({ kind: 'area', x: 120, y: 1400, w: 640, h: 220 })).toBe('(120, 1400) 640×220');
  expect(describeAnchor({ kind: 'image', x: 0, y: 0 })).toBe('whole image');
});

it('sorts open threads first, then by number', () => {
  expect(sortThreads([{ number: 1, status: 'resolved' as const }, { number: 3, status: 'open' as const }, { number: 2, status: 'open' as const }]).map((t) => t.number)).toEqual([2, 3, 1]);
});

describe('threadStage', () => {
  it('asks to verify an open thread whose image changed, and waits on one that did not', () => {
    expect(threadStage({ status: 'open', placement: 'outdated' })).toBe('verify');
    expect(threadStage({ status: 'open', placement: 'exact' })).toBe('waiting');
    expect(threadStage({ status: 'resolved', placement: 'outdated' })).toBe('resolved');
  });
});

describe('closeUpWindow', () => {
  const size = { width: 2560, height: 11274 };
  const box = { width: 400, height: 250 };

  it('centres a point with its reach around it, in the box’s shape', () => {
    const w = closeUpWindow({ kind: 'point', x: 0.5, y: 0.5 }, size, box);
    expect(w.width).toBe(520);
    expect(w.height).toBeCloseTo(325);
    expect(w.left + w.width / 2).toBeCloseTo(1280);
    expect(w.top + w.height / 2).toBeCloseTo(5637);
    expect(w.scale).toBeCloseTo(400 / 520);
  });

  it('stays inside the image at its corners', () => {
    const w = closeUpWindow({ kind: 'point', x: 1, y: 0 }, size, box);
    expect(w.left + w.width).toBeCloseTo(2560);
    expect(w.top).toBe(0);
  });

  it('fits an area with a margin, however tall', () => {
    const w = closeUpWindow({ kind: 'area', x: 0.1, y: 0.1, w: 0.1, h: 0.05 }, size, box);
    expect(w.width).toBeGreaterThanOrEqual(0.1 * 2560);
    expect(w.height).toBeGreaterThanOrEqual(0.05 * 11274);
  });

  it('never magnifies a small image past the limit', () => {
    const w = closeUpWindow({ kind: 'point', x: 0.5, y: 0.5 }, { width: 300, height: 200 }, box);
    expect(w.scale).toBeLessThanOrEqual(400 / 300 + 1e-9);
  });
});
