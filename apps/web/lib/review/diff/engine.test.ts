import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { detectShift, rowHashes } from './align';
import { diffImages, DiffTooLargeError } from './engine';
import { findRegions } from './regions';

type Rect = { x: number; y: number; width: number; height: number; color: [number, number, number] };

/** A white RGBA page with solid rectangles on it, as raw pixels. */
function raw(width: number, height: number, rects: Rect[] = []) {
  const data = Buffer.alloc(width * height * 4, 255);
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        const p = (y * width + x) * 4;
        data[p] = r.color[0];
        data[p + 1] = r.color[1];
        data[p + 2] = r.color[2];
      }
    }
  }
  return data;
}

const png = (width: number, height: number, rects: Rect[] = []) => sharp(raw(width, height, rects), { raw: { width, height, channels: 4 } }).png().toBuffer();

const black: [number, number, number] = [0, 0, 0];

describe('diffImages', () => {
  test('identical pixels are no change, whatever the bytes', async () => {
    const a = await png(64, 48, [{ x: 4, y: 4, width: 10, height: 10, color: black }]);
    const b = await sharp(raw(64, 48, [{ x: 4, y: 4, width: 10, height: 10, color: black }]), { raw: { width: 64, height: 48, channels: 4 } })
      .png({ compressionLevel: 1 })
      .toBuffer();
    expect(a.equals(b)).toBe(false);
    const d = await diffImages(a, b);
    expect(d).toMatchObject({ changedPixels: 0, ratio: 0, sizeChanged: false, regions: [], overlay: null, shift: null });
  });

  test('a changed block is counted and becomes one region', async () => {
    const a = await png(100, 80);
    const b = await png(100, 80, [{ x: 20, y: 30, width: 10, height: 5, color: black }]);
    const d = await diffImages(a, b);
    expect(d.changedPixels).toBe(50);
    expect(d.totalPixels).toBe(8000);
    expect(d.regions).toEqual([{ x: 20, y: 30, width: 10, height: 5, pixels: 50 }]);
    expect(d.overlay).toBeInstanceOf(Buffer);
    const meta = await sharp(d.overlay!).metadata();
    expect([meta.width, meta.height]).toEqual([100, 80]);
  });

  test('changes far apart are separate regions, in reading order', async () => {
    const a = await png(200, 200);
    const b = await png(200, 200, [
      { x: 150, y: 150, width: 20, height: 20, color: black },
      { x: 10, y: 10, width: 4, height: 4, color: black },
    ]);
    const d = await diffImages(a, b);
    expect(d.regions.map((r) => [r.x, r.y])).toEqual([
      [10, 10],
      [150, 150],
    ]);
  });

  test('a colour under the threshold is not a change', async () => {
    const a = await png(40, 40, [{ x: 0, y: 0, width: 40, height: 40, color: [200, 200, 200] }]);
    const b = await png(40, 40, [{ x: 0, y: 0, width: 40, height: 40, color: [201, 201, 201] }]);
    expect((await diffImages(a, b)).changedPixels).toBe(0);
  });

  test('ignored rectangles are left out', async () => {
    const a = await png(100, 100);
    const b = await png(100, 100, [
      { x: 10, y: 10, width: 10, height: 10, color: black },
      { x: 70, y: 70, width: 10, height: 10, color: black },
    ]);
    const d = await diffImages(a, b, { ignore: [{ x: 5, y: 5, width: 20, height: 20 }] });
    expect(d.changedPixels).toBe(100);
    expect(d.regions).toHaveLength(1);
    expect(d.regions[0]).toMatchObject({ x: 70, y: 70 });
  });

  test('a taller page counts the new area as changed', async () => {
    const a = await png(50, 40);
    const b = await png(50, 60);
    const d = await diffImages(a, b);
    expect(d.sizeChanged).toBe(true);
    expect(d.changedPixels).toBe(50 * 20);
    expect(d.totalPixels).toBe(50 * 60);
    expect(d.regions).toEqual([{ x: 0, y: 40, width: 50, height: 20, pixels: 1000 }]);
    expect(d.base).toEqual({ width: 50, height: 40 });
    expect(d.head).toEqual({ width: 50, height: 60 });
  });

  test('inserted content is found as a shift, not a changed page', async () => {
    // A page of striped rows; the new one has a 10-row banner inserted at y = 20.
    const stripes = (offset: number, banner: boolean): Rect[] => {
      const rects: Rect[] = [];
      for (let i = 0; i < 20; i++) rects.push({ x: 0, y: offset + i * 4 + (banner && i >= 5 ? 10 : 0), width: 30 + i, height: 2, color: [i * 10, 0, 0] });
      if (banner) rects.push({ x: 0, y: 20, width: 60, height: 10, color: [0, 0, 255] });
      return rects;
    };
    const a = await png(60, 100, stripes(0, false));
    const b = await png(60, 110, stripes(0, true));
    const d = await diffImages(a, b);
    expect(d.shift).not.toBeNull();
    expect(d.shift!.inserted).toEqual([{ y: 20, height: 10 }]);
    expect(d.shift!.removed).toEqual([]);
  });

  test('images over the pixel budget are refused', async () => {
    const a = await png(100, 100);
    await expect(diffImages(a, a, { maxPixels: 5000 })).rejects.toBeInstanceOf(DiffTooLargeError);
  });
});

describe('findRegions', () => {
  test('nothing changed, no regions', () => {
    expect(findRegions(10, 10, () => false)).toEqual({ regions: [], truncated: false });
  });

  test('keeps the largest regions past the cap', () => {
    const changed = new Set<number>();
    // A grid of isolated pixels 40 px apart: one region each.
    for (let y = 0; y < 400; y += 40) for (let x = 0; x < 400; x += 40) changed.add(y * 400 + x);
    const r = findRegions(400, 400, (i) => changed.has(i), { max: 10 });
    expect(r.regions).toHaveLength(10);
    expect(r.truncated).toBe(true);
  });
});

describe('detectShift', () => {
  test('rows that did not move are no shift', () => {
    const rows = Uint32Array.from([1, 2, 3, 4]);
    expect(detectShift(rows, Uint32Array.from([1, 2, 9, 4]))).toBeNull();
  });

  test('removed rows are reported in the base', () => {
    const base = Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const head = Uint32Array.from([1, 2, 5, 6, 7, 8]);
    expect(detectShift(base, head)).toEqual({ inserted: [], removed: [{ y: 2, height: 2 }], matchedRows: 6 });
  });

  test('row hashes tell rows apart', () => {
    const img = raw(4, 2, [{ x: 0, y: 1, width: 1, height: 1, color: black }]);
    const [r0, r1] = rowHashes(img, 4, 2);
    expect(r0).not.toBe(r1);
  });
});
