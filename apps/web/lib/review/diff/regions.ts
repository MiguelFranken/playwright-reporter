/**
 * Where an image changed: the diff mask grouped into a few rectangles a
 * reviewer can jump between.
 *
 * The mask is binned into square cells; cells that hold a changed pixel and
 * lie within `gap` cells of each other form one region, so a changed line of
 * text is one region rather than one per glyph. Each region keeps the exact
 * pixel bounds of its changes, not the cells' coarser ones.
 */
import type { DiffRegion } from '@miguelfranken/ui/lib/review';

export const REGION_CELL = 8;
/** Changes closer than this many cells (24 px) are one region. */
export const REGION_GAP = 3;
export const MAX_REGIONS = 50;

export interface RegionResult {
  regions: DiffRegion[];
  /** More regions existed than `MAX_REGIONS`; the smallest were dropped. */
  truncated: boolean;
}

/**
 * Regions of a mask of `width` × `height` pixels, where `changed(i)` says
 * whether pixel `i` (row-major) changed. Reading order: top to bottom, then
 * left to right.
 */
export function findRegions(width: number, height: number, changed: (i: number) => boolean, opts: { cell?: number; gap?: number; max?: number } = {}): RegionResult {
  const cell = opts.cell ?? REGION_CELL;
  const gap = opts.gap ?? REGION_GAP;
  const max = opts.max ?? MAX_REGIONS;
  const cw = Math.ceil(width / cell);
  const ch = Math.ceil(height / cell);
  const cells = cw * ch;
  const count = new Uint32Array(cells);
  const minX = new Int32Array(cells).fill(-1);
  const maxX = new Int32Array(cells);
  const minY = new Int32Array(cells);
  const maxY = new Int32Array(cells);
  const occupied: number[] = [];

  for (let y = 0, i = 0; y < height; y++) {
    const cy = (y / cell) | 0;
    for (let x = 0; x < width; x++, i++) {
      if (!changed(i)) continue;
      const c = cy * cw + ((x / cell) | 0);
      if (count[c] === 0) {
        occupied.push(c);
        minX[c] = x;
        maxX[c] = x;
        minY[c] = y;
        maxY[c] = y;
      } else {
        if (x < minX[c]) minX[c] = x;
        if (x > maxX[c]) maxX[c] = x;
        maxY[c] = y;
      }
      count[c]++;
    }
  }
  if (occupied.length === 0) return { regions: [], truncated: false };

  const seen = new Uint8Array(cells);
  let boxes: DiffRegion[] = [];
  const stack: number[] = [];
  for (const start of occupied) {
    if (seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    let pixels = 0;
    while (stack.length) {
      const c = stack.pop()!;
      pixels += count[c];
      if (minX[c] < x0) x0 = minX[c];
      if (minY[c] < y0) y0 = minY[c];
      if (maxX[c] > x1) x1 = maxX[c];
      if (maxY[c] > y1) y1 = maxY[c];
      const cx = c % cw;
      const cy = (c / cw) | 0;
      for (let ny = Math.max(0, cy - gap); ny <= Math.min(ch - 1, cy + gap); ny++) {
        for (let nx = Math.max(0, cx - gap); nx <= Math.min(cw - 1, cx + gap); nx++) {
          const n = ny * cw + nx;
          if (count[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    boxes.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1, pixels });
  }

  boxes = mergeOverlapping(boxes);
  boxes.sort((a, b) => b.pixels - a.pixels);
  const truncated = boxes.length > max;
  return { regions: boxes.slice(0, max).sort(readingOrder), truncated };
}

export function readingOrder(a: DiffRegion, b: DiffRegion) {
  return a.y - b.y || a.x - b.x;
}

const overlaps = (a: DiffRegion, b: DiffRegion) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Bounding boxes of neighbouring components can overlap; overlapping ones become one. */
export function mergeOverlapping(input: readonly DiffRegion[]): DiffRegion[] {
  let boxes = [...input];
  let merged = true;
  while (merged) {
    merged = false;
    const out: DiffRegion[] = [];
    for (const box of boxes) {
      const hit = out.find((o) => overlaps(o, box));
      if (!hit) {
        out.push({ ...box });
        continue;
      }
      const x1 = Math.max(hit.x + hit.width, box.x + box.width);
      const y1 = Math.max(hit.y + hit.height, box.y + box.height);
      hit.x = Math.min(hit.x, box.x);
      hit.y = Math.min(hit.y, box.y);
      hit.width = x1 - hit.x;
      hit.height = y1 - hit.y;
      hit.pixels += box.pixels;
      merged = true;
    }
    boxes = out;
  }
  return boxes;
}
