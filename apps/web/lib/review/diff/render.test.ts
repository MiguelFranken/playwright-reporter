import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { labelRegions } from '@miguelfranken/ui/lib/visual-diff';
import { diffImages } from './engine';
import { clampRect, padRect, render, RenderError, tilesOf, type RenderContext, type RenderSource } from './render';

type Box = { x: number; y: number; width: number; height: number; color?: [number, number, number] };

/** A white page with coloured boxes on it, as a PNG and as a render source. */
async function page(width: number, height: number, boxes: Box[] = []): Promise<RenderSource> {
  const data = Buffer.alloc(width * height * 4, 255);
  for (const b of boxes) {
    const [r, g, bl] = b.color ?? [0, 0, 0];
    for (let y = b.y; y < b.y + b.height; y++)
      for (let x = b.x; x < b.x + b.width; x++) {
        const p = (y * width + x) * 4;
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = bl;
      }
  }
  const bytes = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { captureId: `cap-${width}x${height}-${boxes.length}`, bytes, width, height };
}

const pixel = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const p = (y * info.width + x) * 4;
  return [data[p], data[p + 1], data[p + 2], data[p + 3]];
};

const ctx = (base: RenderSource | null, head: RenderSource | null, extra: Partial<RenderContext> = {}): RenderContext => ({ base, head, overlay: null, threshold: 0.1, policy: 'raw', ignore: [], ...extra });

describe('geometry helpers', () => {
  test('clamps and pads within the image', () => {
    expect(clampRect({ x: -5, y: 10, width: 20, height: 200 }, { width: 100, height: 50 })).toEqual({ x: 0, y: 10, width: 15, height: 40 });
    expect(clampRect({ x: 200, y: 0, width: 5, height: 5 }, { width: 100, height: 50 })).toBeNull();
    expect(padRect({ x: 10, y: 10, width: 10, height: 10 }, 24, { width: 100, height: 100 })).toEqual({ x: 0, y: 0, width: 44, height: 44 });
  });

  test('tiles a long rectangle with overlap and leaves a short one whole', () => {
    expect(tilesOf({ x: 0, y: 0, width: 500, height: 30 })).toEqual([{ x: 0, y: 0, width: 500, height: 30 }]);
    const tiles = tilesOf({ x: 100, y: 0, width: 2500, height: 30 }, 1024, 32);
    expect(tiles.map((t) => t.x)).toEqual([100, 1092, 1576]);
    expect(tiles.every((t) => t.width <= 1024)).toBe(true);
    expect(tiles.at(-1)!.x + tiles.at(-1)!.width).toBe(2600);
  });
});

describe('render', () => {
  test('base and head crops come at the source resolution, scaled only when too wide', async () => {
    const head = await page(200, 100, [{ x: 20, y: 20, width: 10, height: 10 }]);
    const out = await render({ mode: 'head', side: 'head', rect: { x: 10, y: 10, width: 40, height: 30 }, maxBytes: 1 << 20 }, ctx(null, head));
    expect(out).toMatchObject({ width: 40, height: 30, scale: 1, side: 'head', sourceRect: { x: 10, y: 10, width: 40, height: 30 }, mimeType: 'image/png' });
    expect(await pixel(out.data, 15, 15)).toEqual([0, 0, 0, 255]);
    const wide = await page(3000, 100);
    const whole = await render({ mode: 'base', side: 'base', rect: null, maxBytes: 1 << 20 }, ctx(wide, null));
    expect(whole.width).toBe(1280);
    expect(whole.scale).toBeCloseTo(1280 / 3000, 3);
  });

  test('annotated draws the regions on the head', async () => {
    const base = await page(300, 200);
    const head = await page(300, 200, [{ x: 100, y: 100, width: 40, height: 20 }]);
    const diff = await diffImages(Buffer.from(base.bytes), Buffer.from(head.bytes));
    const regions = labelRegions(diff.regions, { base, head });
    expect(regions.map((r) => r.label)).toEqual(['D1']);
    const out = await render({ mode: 'annotated', side: 'head', rect: null, regions, ignored: [{ x: 10, y: 10, width: 30, height: 30 }], maxBytes: 1 << 20 }, ctx(base, head));
    expect(out).toMatchObject({ width: 300, height: 200 });
    // The box's stroke sits on the region's edge: red where the page was white.
    const [r, g, b] = await pixel(out.data, 99, 110);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(120);
    expect(b).toBeLessThan(120);
  });

  test('mask and highlight use the stored overlay when there is one, else measure the rectangle', async () => {
    const base = await page(120, 80);
    const head = await page(120, 80, [{ x: 50, y: 40, width: 10, height: 10 }]);
    const diff = await diffImages(Buffer.from(base.bytes), Buffer.from(head.bytes));
    const stored = await render({ mode: 'mask', side: 'head', rect: null, maxBytes: 1 << 20 }, ctx(base, head, { overlay: diff.overlay }));
    expect(stored.maskSource).toBe('measurement');
    expect(await pixel(stored.data, 55, 45)).toEqual([255, 255, 255, 255]);
    expect(await pixel(stored.data, 5, 5)).toEqual([0, 0, 0, 255]);
    const computed = await render({ mode: 'highlight', side: 'head', rect: { x: 40, y: 30, width: 30, height: 30 }, maxBytes: 1 << 20 }, ctx(base, head));
    expect(computed).toMatchObject({ maskSource: 'computed', side: 'both', sourceRect: { x: 40, y: 30, width: 30, height: 30 } });
    const [r, g, b] = await pixel(computed.data, 15, 15);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
    expect(await pixel(computed.data, 2, 2)).toEqual([255, 255, 255, 255]);
  });

  test('the effective policy leaves the ignored rectangles out of a computed mask', async () => {
    const base = await page(120, 80);
    const head = await page(120, 80, [{ x: 50, y: 40, width: 10, height: 10 }]);
    const out = await render({ mode: 'mask', side: 'head', rect: null, maxBytes: 1 << 20 }, ctx(base, head, { policy: 'effective', ignore: [{ x: 45, y: 35, width: 20, height: 20 }] }));
    expect(await pixel(out.data, 55, 45)).toEqual([0, 0, 0, 255]);
  });

  test('difference is black where nothing changed; onion blends both', async () => {
    const base = await page(60, 40, [{ x: 0, y: 0, width: 20, height: 40, color: [255, 0, 0] }]);
    const head = await page(60, 40, [{ x: 0, y: 0, width: 20, height: 40, color: [0, 0, 255] }]);
    const diff = await render({ mode: 'difference', side: 'head', rect: null, maxBytes: 1 << 20 }, ctx(base, head));
    expect(await pixel(diff.data, 50, 20)).toEqual([0, 0, 0, 255]);
    const [r, , b] = await pixel(diff.data, 10, 20);
    expect(r).toBe(255);
    expect(b).toBe(255);
    const onion = await render({ mode: 'onion', side: 'head', rect: null, maxBytes: 1 << 20 }, ctx(base, head));
    const [or, , ob] = await pixel(onion.data, 10, 20);
    expect(or).toBeGreaterThan(100);
    expect(ob).toBeGreaterThan(100);
  });

  test('two-image modes work on the part both images cover', async () => {
    const base = await page(100, 60);
    const head = await page(100, 90, [{ x: 0, y: 70, width: 100, height: 20 }]);
    const out = await render({ mode: 'highlight', side: 'head', rect: null, maxBytes: 1 << 20 }, ctx(base, head));
    expect(out.sourceRect).toEqual({ x: 0, y: 0, width: 100, height: 60 });
    await expect(render({ mode: 'mask', side: 'head', rect: { x: 0, y: 70, width: 100, height: 20 }, maxBytes: 1 << 20 }, ctx(base, head))).rejects.toBeInstanceOf(RenderError);
    await expect(render({ mode: 'head', side: 'head', rect: null, maxBytes: 1 << 20 }, ctx(base, null))).rejects.toBeInstanceOf(RenderError);
  });
});
