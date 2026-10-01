import { describe, expect, it } from 'vitest';
import {
  anchorForMarkup,
  describeShape,
  isFractionMarkup,
  markupBounds,
  markupColors,
  markupToPixels,
  MAX_MARKUP_SHAPES,
  projectMarkup,
  shapeFromDrag,
  simplifyStroke,
  strokePath,
  type MarkupShape,
} from './review-markup';

const pen: MarkupShape = { tool: 'pen', color: 'blue', points: [0.1, 0.2, 0.3, 0.25, 0.4, 0.5] };
const box: MarkupShape = { tool: 'rect', color: 'yellow', points: [0.6, 0.7, 0.5, 0.6] };

describe('projectMarkup', () => {
  it('turns pixels into fractions of the same image', () => {
    expect(projectMarkup([{ tool: 'arrow', color: 'red', points: [640, 1000, 1280, 2000] }], { width: 1280, height: 4000 })).toEqual([{ tool: 'arrow', color: 'red', points: [0.5, 0.25, 1, 0.5] }]);
  });

  it('keeps shapes at their distance from the top when a full page grows, like pins', () => {
    const [s] = projectMarkup([{ tool: 'pen', color: 'red', points: [640, 1000] }], { width: 1280, height: 4000 }, { width: 1280, height: 5000 });
    expect(s.points[1]).toBeCloseTo(0.2);
  });

  it('round-trips with markupToPixels', () => {
    const size = { width: 1280, height: 4000 };
    const shapes: MarkupShape[] = [{ tool: 'ellipse', color: 'green', points: [120, 1400, 760, 1620] }];
    expect(markupToPixels(projectMarkup(shapes, size), size)).toEqual(shapes);
  });
});

describe('isFractionMarkup', () => {
  it('accepts strokes and two-point shapes', () => {
    expect(isFractionMarkup([pen, box, { tool: 'pen', color: 'red', points: [0.5, 0.5] }])).toBe(true);
  });

  it('rejects unknown tools and colours, points outside the image, and odd shapes', () => {
    expect(isFractionMarkup([{ ...pen, tool: 'spray' }])).toBe(false);
    expect(isFractionMarkup([{ ...pen, color: 'magenta' }])).toBe(false);
    expect(isFractionMarkup([{ ...pen, points: [0.1, 1.2] }])).toBe(false);
    expect(isFractionMarkup([{ ...pen, points: [0.1] }])).toBe(false);
    expect(isFractionMarkup([{ ...box, points: [0.1, 0.1, 0.2, 0.2, 0.3, 0.3] }])).toBe(false);
    expect(isFractionMarkup([])).toBe(false);
    expect(isFractionMarkup('pen')).toBe(false);
  });

  it('caps how much one drawing holds', () => {
    expect(isFractionMarkup(Array.from({ length: MAX_MARKUP_SHAPES + 1 }, () => pen))).toBe(false);
  });
});

describe('anchorForMarkup', () => {
  it('is the area every shape covers', () => {
    const a = anchorForMarkup([pen, box])!;
    expect(a.kind).toBe('area');
    expect(a.x).toBeCloseTo(0.1);
    expect(a.y).toBeCloseTo(0.2);
    expect(a.w).toBeCloseTo(0.5);
    expect(a.h).toBeCloseTo(0.5);
  });

  it('gives a dot a small area, inside the image', () => {
    expect(anchorForMarkup([{ tool: 'pen', color: 'red', points: [1, 1] }])).toEqual({ kind: 'area', x: 0.99, y: 0.99, w: 0.01, h: 0.01 });
  });

  it('is null without shapes', () => {
    expect(anchorForMarkup([])).toBeNull();
    expect(markupBounds([])).toBeNull();
  });
});

describe('shapeFromDrag', () => {
  it('ignores a click', () => {
    expect(shapeFromDrag('arrow', 'red', { x: 0.5, y: 0.5 }, { x: 0.501, y: 0.5 })).toBeNull();
  });

  it('keeps the direction of an arrow', () => {
    expect(shapeFromDrag('arrow', 'red', { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.1 })?.points).toEqual([0.5, 0.5, 0.2, 0.1]);
  });
});

describe('simplifyStroke', () => {
  it('drops points on a straight line and keeps the corners', () => {
    expect(simplifyStroke([0, 0, 1, 0, 2, 0, 3, 0, 3, 1, 3, 2], 0.1)).toEqual([0, 0, 3, 0, 3, 2]);
  });

  it('leaves short strokes alone', () => {
    expect(simplifyStroke([0, 0, 5, 5], 1)).toEqual([0, 0, 5, 5]);
  });
});

describe('strokePath', () => {
  it('draws a dot for one point and curves through more', () => {
    expect(strokePath([1, 2])).toBe('M1 2L1 2');
    expect(strokePath([0, 0, 10, 0, 10, 10])).toBe('M0 0Q10 0 10 5L10 10');
  });
});

describe('describeShape', () => {
  it('names the colour, the shape and where it is', () => {
    expect(describeShape({ tool: 'ellipse', color: 'blue', points: [320, 380, 120, 300] })).toBe('blue ellipse (120, 300) 200×80');
    expect(describeShape({ tool: 'arrow', color: 'red', points: [40, 60, 300, 410] })).toBe('red arrow from (40, 60) to (300, 410)');
    expect(describeShape({ tool: 'highlighter', color: 'yellow', points: [12, 90, 412, 108] })).toBe('yellow highlighter stroke over (12, 90) 400×18');
  });
});

describe('markupColors', () => {
  it('lists each colour once, in order of use', () => {
    expect(markupColors([pen, box, { ...pen, color: 'yellow' }])).toEqual(['blue', 'yellow']);
    expect(markupColors(null)).toEqual([]);
  });
});
