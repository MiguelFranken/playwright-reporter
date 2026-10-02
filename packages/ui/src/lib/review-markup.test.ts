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
  shapeDistance,
  simplifyStroke,
  streamlinePoint,
  constrainDrag,
  isMarkupTool,
  isFractionShape,
  COMMENT_TOOLS,
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
  it('draws a dot for one point, a line for two, and bends through more', () => {
    expect(strokePath([1, 2])).toBe('M1 2L1 2');
    expect(strokePath([0, 0, 6, 0])).toBe('M0 0L6 0');
    // A Catmull–Rom spline: it passes through every point, its tangent at each the chord of its neighbours.
    expect(strokePath([0, 0, 6, 0, 6, 6])).toBe('M0 0C1 0 5 -1 6 0C7 1 6 5 6 6');
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

describe('streamlinePoint', () => {
  it('goes part of the way to the pointer', () => {
    expect(streamlinePoint({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
    expect(streamlinePoint({ x: 0, y: 0 }, { x: 10, y: 20 }, 0)).toEqual({ x: 10, y: 20 });
  });

  it('always moves', () => {
    expect(streamlinePoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 1).x).toBeGreaterThan(0);
  });
});

describe('constrainDrag', () => {
  it('turns an arrow to the nearest 45°, keeping its length', () => {
    const end = constrainDrag('arrow', { x: 0, y: 0 }, { x: 100, y: 10 });
    expect(end.x).toBeCloseTo(Math.hypot(100, 10));
    expect(end.y).toBeCloseTo(0);
    const diagonal = constrainDrag('arrow', { x: 0, y: 0 }, { x: 50, y: -45 });
    expect(diagonal.x).toBeCloseTo(-diagonal.y);
  });

  it('makes a box square and an ellipse round, toward the drag', () => {
    expect(constrainDrag('rect', { x: 10, y: 10 }, { x: 40, y: -50 })).toEqual({ x: 70, y: -50 });
    expect(constrainDrag('ellipse', { x: 0, y: 0 }, { x: -20, y: 5 })).toEqual({ x: -20, y: 20 });
  });
});

describe('shapeDistance', () => {
  it('measures to a stroke and an arrow along their lines', () => {
    expect(shapeDistance({ tool: 'pen', color: 'red', points: [0, 0, 10, 0, 10, 10] }, { x: 5, y: 3 })).toBeCloseTo(3);
    expect(shapeDistance({ tool: 'arrow', color: 'red', points: [0, 0, 10, 0] }, { x: 14, y: 3 })).toBeCloseTo(5);
    expect(shapeDistance({ tool: 'pen', color: 'red', points: [2, 2] }, { x: 5, y: 6 })).toBeCloseTo(5);
  });

  it('measures to a box’s outline, not its inside', () => {
    const rect: MarkupShape = { tool: 'rect', color: 'red', points: [0, 0, 100, 50] };
    expect(shapeDistance(rect, { x: 50, y: 25 })).toBeCloseTo(25);
    expect(shapeDistance(rect, { x: 102, y: 25 })).toBeCloseTo(2);
  });

  it('measures to an ellipse’s rim', () => {
    const ellipse: MarkupShape = { tool: 'ellipse', color: 'red', points: [0, 0, 100, 50] };
    expect(shapeDistance(ellipse, { x: 100, y: 25 })).toBeCloseTo(0);
    expect(shapeDistance(ellipse, { x: 50, y: 25 })).toBeCloseTo(25);
    expect(shapeDistance(ellipse, { x: 50, y: -3 })).toBeCloseTo(3);
  });
});

describe('comment tools', () => {
  it('keeps pins and areas apart, then the drawing tools and the eraser', () => {
    expect(COMMENT_TOOLS).toEqual(['pin', 'area', 'pen', 'highlighter', 'arrow', 'rect', 'ellipse', 'eraser']);
    expect(COMMENT_TOOLS.filter(isMarkupTool)).toEqual(['pen', 'highlighter', 'arrow', 'rect', 'ellipse']);
  });

  it('checks one shape the way it checks a drawing', () => {
    expect(isFractionShape(pen)).toBe(true);
    expect(isFractionShape({ ...pen, tool: 'eraser' })).toBe(false);
  });
});
