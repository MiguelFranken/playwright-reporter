/**
 * Drawings on review images: what a reviewer sketches on a screenshot when a
 * pin or an area does not say it — a stroke around the parts that belong
 * together, an arrow from where something is to where it should go, a box
 * and an ellipse in different colours ("the blue area grows, the yellow one
 * shrinks"). A drawing belongs to a comment thread; the thread's anchor is
 * the area the drawing covers, so its pin, its close-ups and its place on
 * later images work as for any area.
 *
 * Shapes are plain data in the vocabulary threads use: stored in the origin
 * image's pixels, handed to views in fractions of the image they are drawn
 * on. The colours have names, because people refer to them in the comment
 * and an AI agent reads both.
 */
import type { FractionAnchor, ImageSize } from './review-threads';

/**
 * - `pen`: a freehand stroke.
 * - `highlighter`: a wide, translucent freehand stroke, for marking text.
 * - `arrow`: from its first point to its second.
 * - `rect`, `ellipse`: in the box between two opposite corners.
 */
export const MARKUP_TOOLS = ['pen', 'highlighter', 'arrow', 'rect', 'ellipse'] as const;
export type MarkupTool = (typeof MARKUP_TOOLS)[number];

export const MARKUP_TOOL_LABELS: Record<MarkupTool, string> = { pen: 'Pen', highlighter: 'Highlighter', arrow: 'Arrow', rect: 'Rectangle', ellipse: 'Ellipse' };

export const MARKUP_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type MarkupColor = (typeof MARKUP_COLORS)[number];

export const MARKUP_COLOR_LABELS: Record<MarkupColor, string> = { red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple' };

/**
 * The ink of each colour. Values, not theme tokens: a drawing is on a
 * screenshot's pixels, the same in light and dark mode and in the images the
 * server draws for AI agents. Saturated and mid-light, so each reads on a
 * white page and on a dark one, and each is told apart from the others.
 */
export const MARKUP_INK: Record<MarkupColor, string> = {
  red: '#e5484d',
  orange: '#f76b15',
  yellow: '#f5c400',
  green: '#30a46c',
  blue: '#0090ff',
  purple: '#8e4ec6',
};

export const DEFAULT_MARKUP_COLOR: MarkupColor = 'red';

/**
 * One shape. `points` is flat — `[x0, y0, x1, y1, …]` — in pixels of some
 * image or, in views, in fractions of the image it is drawn on. A stroke has
 * one point or more; an arrow, a box and an ellipse exactly two.
 */
export interface MarkupShape {
  tool: MarkupTool;
  color: MarkupColor;
  points: number[];
}

/** The most shapes one thread draws. */
export const MAX_MARKUP_SHAPES = 40;
/** The most points one stroke keeps (strokes are simplified as they are drawn). */
export const MAX_STROKE_POINTS = 800;
/** The most points one thread's drawing keeps, every shape together. */
export const MAX_MARKUP_POINTS = 4000;

export const isStroke = (tool: MarkupTool) => tool === 'pen' || tool === 'highlighter';

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** A shape's points as `[x, y]` pairs. */
export function pairs(points: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push([points[i], points[i + 1]]);
  return out;
}

/**
 * Shapes in `from` pixels, onto an image of `to` pixels, as fractions of
 * `to` — the way `projectAnchor` moves a pin: scaled by the widths, kept at
 * their distance from the top.
 */
export function projectMarkup(shapes: readonly MarkupShape[], from: ImageSize, to?: ImageSize | null): MarkupShape[] {
  const target = to?.width && to.height ? to : from;
  const scale = target.width / from.width;
  return shapes.map((s) => ({ ...s, points: s.points.map((n, i) => clamp01((n * scale) / (i % 2 === 0 ? target.width : target.height))) }));
}

/** Shapes in fractions, in pixels of an image of `size` (to a tenth of a pixel). */
export function markupToPixels(shapes: readonly MarkupShape[], size: ImageSize): MarkupShape[] {
  return shapes.map((s) => ({ ...s, points: s.points.map((n, i) => Math.round(clamp01(n) * (i % 2 === 0 ? size.width : size.height) * 10) / 10) }));
}

/** Whether `value` is a drawing views may send: known tools and colours, points inside the image, within the limits. */
export function isFractionMarkup(value: unknown): value is MarkupShape[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MARKUP_SHAPES) return false;
  let total = 0;
  for (const shape of value) {
    if (!shape || typeof shape !== 'object') return false;
    const s = shape as Record<string, unknown>;
    if (!(MARKUP_TOOLS as readonly unknown[]).includes(s.tool) || !(MARKUP_COLORS as readonly unknown[]).includes(s.color)) return false;
    const points = s.points;
    if (!Array.isArray(points) || points.length % 2 !== 0) return false;
    const count = points.length / 2;
    if (isStroke(s.tool as MarkupTool) ? count < 1 || count > MAX_STROKE_POINTS : count !== 2) return false;
    if (!points.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) return false;
    total += count;
  }
  return total <= MAX_MARKUP_POINTS;
}

/** Only the fields a shape has, in case a caller sent more. */
export const cleanMarkup = (shapes: readonly MarkupShape[]): MarkupShape[] => shapes.map((s) => ({ tool: s.tool, color: s.color, points: [...s.points] }));

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The box a shape covers, in its own units. */
export function shapeBounds(shape: MarkupShape): Box {
  const xs = shape.points.filter((_, i) => i % 2 === 0);
  const ys = shape.points.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The box every shape covers, or `null` without shapes. */
export function markupBounds(shapes: readonly MarkupShape[]): Box | null {
  if (shapes.length === 0) return null;
  const boxes = shapes.map(shapeBounds);
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/**
 * The anchor of a thread that carries a drawing: the area the drawing covers,
 * at least `minFraction` across, kept inside the image. Its pin goes on the
 * area's corner, its close-ups show the whole drawing.
 */
export function anchorForMarkup(shapes: readonly MarkupShape[], minFraction = 0.01): FractionAnchor | null {
  const b = markupBounds(shapes);
  if (!b) return null;
  const w = Math.max(b.w, minFraction);
  const h = Math.max(b.h, minFraction);
  const x = clamp01(Math.min(b.x, 1 - w));
  const y = clamp01(Math.min(b.y, 1 - h));
  return { kind: 'area', x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

/** An arrow, box or ellipse from one corner of a drag to the other; `null` for a drag too short to mean one. */
export function shapeFromDrag(tool: Exclude<MarkupTool, 'pen' | 'highlighter'>, color: MarkupColor, start: { x: number; y: number }, end: { x: number; y: number }, minFraction = 0.006): MarkupShape | null {
  if (Math.hypot(end.x - start.x, end.y - start.y) < minFraction) return null;
  return { tool, color, points: [start.x, start.y, end.x, end.y] };
}

/**
 * A polyline with the points that do not change its shape dropped
 * (Ramer–Douglas–Peucker), within `epsilon` of the original, in the units of
 * `points`. A stroke drawn with a mouse has a point every few pixels; most
 * of them are on a line.
 */
export function simplifyStroke(points: readonly number[], epsilon: number): number[] {
  const pts = pairs(points);
  if (pts.length <= 2) return [...points];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay);
    let far = -1;
    let farDist = epsilon;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > farDist) {
        far = i;
        farDist = d;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]).flat();
}

/**
 * A stroke as a smooth SVG path through its points: a Catmull–Rom spline,
 * written as cubic curves, so the line bends through every point it kept
 * instead of turning at it. One point is a dot (drawn with round caps).
 */
export function strokePath(points: readonly number[], digits = 4): string {
  const f = (n: number) => Number(n.toFixed(digits));
  const pts = pairs(points);
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}L${f(pts[0][0])} ${f(pts[0][1])}`;
  if (pts.length === 2) return `M${f(pts[0][0])} ${f(pts[0][1])}L${f(pts[1][0])} ${f(pts[1][1])}`;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${f(x1 + (x2 - x0) / 6)} ${f(y1 + (y2 - y0) / 6)} ${f(x2 - (x3 - x1) / 6)} ${f(y2 - (y3 - y1) / 6)} ${f(x2)} ${f(y2)}`;
  }
  return d;
}

/**
 * How much a stroke's pointer is steadied as it is drawn (0 follows the
 * pointer, 1 never moves): each point goes only part of the way from the
 * last one to the pointer, the way Figma's pencil smooths a hand's jitter.
 * The highlighter, drawn in long sweeps over text, is steadied more.
 */
export const STREAMLINE: Record<'pen' | 'highlighter', number> = { pen: 0.45, highlighter: 0.6 };

/** The next point of a stroke steadied by `streamline`: from `last` toward `pointer`. */
export function streamlinePoint(last: { x: number; y: number }, pointer: { x: number; y: number }, streamline: number): { x: number; y: number } {
  const t = 1 - Math.min(0.95, Math.max(0, streamline));
  return { x: last.x + (pointer.x - last.x) * t, y: last.y + (pointer.y - last.y) * t };
}

/**
 * The end of a drag held with Shift, in screen pixels: an arrow turns to the
 * nearest 45°, a box and an ellipse become a square and a circle.
 */
export function constrainDrag(tool: 'arrow' | 'rect' | 'ellipse', start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (tool === 'arrow') {
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    const len = Math.hypot(dx, dy);
    return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) };
}

const segmentDistance = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/**
 * How far `at` is from a shape's ink, in the units of both — screen pixels,
 * for the eraser. A stroke and an arrow are their lines, a box its outline,
 * an ellipse its rim (measured along the ray from its centre, near enough
 * for a pointer).
 */
export function shapeDistance(shape: MarkupShape, at: { x: number; y: number }): number {
  const pts = pairs(shape.points);
  if (isStroke(shape.tool) || shape.tool === 'arrow') {
    if (pts.length === 1) return Math.hypot(at.x - pts[0][0], at.y - pts[0][1]);
    let best = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, segmentDistance(at.x, at.y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    return best;
  }
  const b = shapeBounds(shape);
  if (shape.tool === 'rect') {
    const [l, t, r, btm] = [b.x, b.y, b.x + b.w, b.y + b.h];
    return Math.min(segmentDistance(at.x, at.y, l, t, r, t), segmentDistance(at.x, at.y, r, t, r, btm), segmentDistance(at.x, at.y, r, btm, l, btm), segmentDistance(at.x, at.y, l, btm, l, t));
  }
  const rx = b.w / 2;
  const ry = b.h / 2;
  const cx = b.x + rx;
  const cy = b.y + ry;
  const dx = at.x - cx;
  const dy = at.y - cy;
  if (rx === 0 || ry === 0) return segmentDistance(at.x, at.y, b.x, b.y, b.x + b.w, b.y + b.h);
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.min(rx, ry);
  // Where the ray from the centre through the pointer meets the rim.
  const k = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  return Math.abs(len - len * k);
}

/** The three corners of an arrow's head at `(x2, y2)`, `size` long, for drawing it as a filled triangle. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [number, number][] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [
    [x2, y2],
    [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)],
    [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)],
  ];
}

/** The colours a drawing uses, in the order they were first used. */
export function markupColors(shapes: readonly MarkupShape[] | null | undefined): MarkupColor[] {
  return [...new Set((shapes ?? []).map((s) => s.color))];
}

const SHAPE_NOUNS: Record<MarkupTool, string> = { pen: 'pen stroke', highlighter: 'highlighter stroke', arrow: 'arrow', rect: 'rectangle', ellipse: 'ellipse' };

const r = Math.round;

/**
 * A shape in words, in the pixels it is given in: `blue ellipse (120, 300)
 * 200×80`, `red arrow from (40, 60) to (300, 410)`, `yellow highlighter
 * stroke over (12, 90) 400×18` — what a tool hands an AI agent with the image.
 */
export function describeShape(shape: MarkupShape): string {
  const what = `${shape.color} ${SHAPE_NOUNS[shape.tool]}`;
  if (shape.tool === 'arrow') {
    const [x1, y1, x2, y2] = shape.points;
    return `${what} from (${r(x1)}, ${r(y1)}) to (${r(x2)}, ${r(y2)})`;
  }
  const b = shapeBounds(shape);
  const at = `(${r(b.x)}, ${r(b.y)}) ${r(b.w)}×${r(b.h)}`;
  return isStroke(shape.tool) ? `${what} over ${at}` : `${what} ${at}`;
}

/**
 * What a click or drag on the image does in comment mode: drop a pin, mark
 * an area, draw, or erase what was drawn. Pins and areas start a comment;
 * drawings stand on their own, for everyone looking at the image.
 */
export const COMMENT_TOOLS = ['pin', 'area', ...MARKUP_TOOLS, 'eraser'] as const;
export type CommentTool = (typeof COMMENT_TOOLS)[number];

export const COMMENT_TOOL_LABELS: Record<CommentTool, string> = { pin: 'Pin', area: 'Area', ...MARKUP_TOOL_LABELS, eraser: 'Eraser' };

/** Whether a tool draws (and so has a colour). */
export const isMarkupTool = (tool: CommentTool): tool is MarkupTool => (MARKUP_TOOLS as readonly string[]).includes(tool);

/** What to do with each tool, as comment mode's hint says it. */
export const COMMENT_TOOL_HINTS: Record<CommentTool, string> = {
  pin: 'Click the screenshot to pin a comment.',
  area: 'Drag over the screenshot to comment on an area.',
  pen: 'Draw on the screenshot. Drawings are saved as you draw.',
  highlighter: 'Drag over what you mean to highlight it.',
  arrow: 'Drag from where something is to where it should go. Shift keeps it straight.',
  rect: 'Drag to draw a box. Shift draws a square.',
  ellipse: 'Drag to circle something. Shift draws a circle.',
  eraser: 'Click a drawing, or drag across drawings, to erase them.',
};

/**
 * A drawing on a review image, on its own: one shape somebody drew to show
 * what they mean, without a comment. It is shown on the image it was drawn
 * on and on every capture with the same pixels. Points are fractions of the
 * image on show.
 */
export interface ReviewDrawingView extends MarkupShape {
  id: string;
  /** Who drew it, to say so and to let them erase it. */
  authorId?: string | null;
  authorName?: string | null;
  createdAt?: string;
  /** Saved optimistically, not confirmed yet. */
  pending?: boolean;
}

/** Drawings to save on a capture, with ids the browser chose, so it can take them back before the page catches up. */
export interface NewDrawingsInput {
  captureId: string;
  drawings: { id: string; shape: MarkupShape }[];
  /** The image's size as the browser loaded it, for a capture that recorded none. */
  imageSize?: ImageSize | null;
}

export interface DeleteDrawingsInput {
  drawingIds: string[];
}

/** The most drawings one image keeps. */
export const MAX_IMAGE_DRAWINGS = 500;

/** Whether `value` is one shape views may send: a known tool and colour, points inside the image, within the limits. */
export const isFractionShape = (value: unknown): value is MarkupShape => isFractionMarkup([value]);
