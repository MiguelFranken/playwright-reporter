import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { annotate, cropAround, type PinSpec } from './annotate';

const blank = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).png().toBuffer();
const pin = (number: number, x: number, y: number, extra: Partial<PinSpec> = {}): PinSpec => ({ number, status: 'open', placement: 'exact', anchor: { kind: 'point', x, y }, ...extra });

/** The colour at a point of an encoded image. */
async function pixel(data: Buffer, x: number, y: number) {
  const { data: raw, info } = await sharp(data).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [raw[i], raw[i + 1], raw[i + 2]];
}

describe('annotate', () => {
  it('draws a pin rising from its point, and leaves the rest of the image alone', async () => {
    const out = await annotate(await blank(800, 600), [pin(7, 0.5, 0.5)], { maxBytes: 1 << 20 });
    expect(out).toMatchObject({ width: 800, height: 600, scale: 1, mimeType: 'image/png' });
    const [r, g, b] = await pixel(out.data, 410, 590 / 2);
    expect(b).toBeGreaterThan(r + 60); // the pin's blue, just above and right of the point
    expect(await pixel(out.data, 100, 100)).toEqual([255, 255, 255]);
    void g;
  });

  it('scales a tall full page down to what a model reads', async () => {
    const out = await annotate(await blank(2560, 12000), [], { maxBytes: 1 << 20 });
    expect(out.width).toBeLessThanOrEqual(1280);
    expect(out.width * out.height).toBeLessThanOrEqual(2_400_000);
    expect(out.source).toEqual({ width: 2560, height: 12000 });
  });

  it('crops around a pin, and around an area with a margin', async () => {
    const bytes = await blank(2000, 1500);
    const point = await cropAround(bytes, pin(1, 0.9, 0.1), [], { maxBytes: 1 << 20 });
    expect(point!.region.x + point!.region.w).toBeLessThanOrEqual(2000);
    expect(point!.region.y).toBe(0);
    const area = await cropAround(bytes, pin(2, 0.1, 0.4, { anchor: { kind: 'area', x: 0.1, y: 0.4, w: 0.5, h: 0.2 } }), [], { maxBytes: 1 << 20 });
    expect(area!.region.w).toBeGreaterThan(1000);
    expect(await cropAround(bytes, pin(3, 0, 0, { anchor: { kind: 'image', x: 0, y: 0 } }), [], { maxBytes: 1 << 20 })).toBeNull();
  });
});
