/**
 * The pixel comparison of two review images: how many pixels changed, where,
 * whether the page grew or its content moved, and an overlay of the changes.
 *
 * `sharp` (libvips) decodes the PNGs to raw RGBA and encodes the overlay;
 * `pixelmatch` compares, in YIQ space with anti-aliasing detection, so a
 * font's edge rendered a shade differently is not a change. Both run on
 * Vercel, in a container and locally alike.
 *
 * Memory is about three decoded images (4 bytes a pixel each): a 2× full-page
 * capture of 2560 × 12 000 pixels takes some 370 MB, which is why
 * `maxPixels` caps what is measured.
 */
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import type { DiffRegion, DiffShift } from '@miguelfranken/ui/lib/review';
import { detectShift, rowHashes } from './align';
import { findRegions, mergeOverlapping, readingOrder } from './regions';

/** Bumped whenever the numbers a comparison produces would change: older rows are measured again. */
export const DIFF_ALGORITHM = 'pixelmatch-7.1';

/** Colour distance a pixel may move before it counts as changed (pixelmatch's threshold, 0–1). */
export const DEFAULT_DIFF_THRESHOLD = 0.1;

/** 40 megapixels: a 2× capture of a 1280 px wide page about 7 800 CSS pixels long. */
export const DEFAULT_MAX_PIXELS = 40_000_000;

export interface Size {
  width: number;
  height: number;
}

export interface DiffOptions {
  threshold?: number;
  /** Rectangles of the head image left out of the comparison. */
  ignore?: readonly Pick<DiffRegion, 'x' | 'y' | 'width' | 'height'>[];
  maxPixels?: number;
  /** Encode the overlay (default true). */
  overlay?: boolean;
}

export interface DiffResult {
  changedPixels: number;
  totalPixels: number;
  ratio: number;
  base: Size;
  head: Size;
  sizeChanged: boolean;
  regions: DiffRegion[];
  regionsTruncated: boolean;
  shift: DiffShift | null;
  /** A PNG of the head image's size: the changed pixels red, the rest transparent. Null without changes. */
  overlay: Buffer | null;
}

export class DiffTooLargeError extends Error {
  constructor(
    readonly base: Size,
    readonly head: Size,
    readonly maxPixels: number,
  ) {
    super(`The images are too large to compare (${base.width}×${base.height} and ${head.width}×${head.height}; at most ${maxPixels.toLocaleString('en')} pixels each).`);
  }
}

/** The images' sizes, read from their headers. */
export async function imageSize(buf: Buffer): Promise<Size> {
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error('Not an image.');
  return { width: meta.width, height: meta.height };
}

async function decode(buf: Buffer, maxPixels: number) {
  const { data, info } = await sharp(buf, { limitInputPixels: maxPixels }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** The top-left `width` × `height` pixels of an RGBA image: a view when the width matches, else a copy. */
function crop(data: Buffer, fullWidth: number, width: number, height: number): Buffer {
  if (width === fullWidth) return data.subarray(0, width * height * 4);
  const out = Buffer.allocUnsafe(width * height * 4);
  for (let y = 0; y < height; y++) data.copy(out, y * width * 4, y * fullWidth * 4, (y * fullWidth + width) * 4);
  return out;
}

/** Copies the base's pixels into the head under each ignored rectangle, so they compare equal. */
function applyIgnore(head: Buffer, base: Buffer, width: number, height: number, ignore: DiffOptions['ignore']) {
  for (const r of ignore ?? []) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(width, Math.ceil(r.x + r.width));
    const y1 = Math.min(height, Math.ceil(r.y + r.height));
    if (x1 <= x0 || y1 <= y0) continue;
    for (let y = y0; y < y1; y++) base.copy(head, (y * width + x0) * 4, (y * width + x0) * 4, (y * width + x1) * 4);
  }
}

/**
 * Compares `head` (this run's image) with `base` (the image it is measured
 * against). Where one image covers area the other does not (a taller page),
 * that area counts as changed and is a region of its own.
 */
export async function diffImages(baseBuf: Buffer, headBuf: Buffer, opts: DiffOptions = {}): Promise<DiffResult> {
  const maxPixels = opts.maxPixels ?? DEFAULT_MAX_PIXELS;
  const [baseSize, headSize] = await Promise.all([imageSize(baseBuf), imageSize(headBuf)]);
  if (baseSize.width * baseSize.height > maxPixels || headSize.width * headSize.height > maxPixels) throw new DiffTooLargeError(baseSize, headSize, maxPixels);

  const [base, head] = await Promise.all([decode(baseBuf, maxPixels), decode(headBuf, maxPixels)]);
  const w = Math.min(base.width, head.width);
  const h = Math.min(base.height, head.height);
  const sizeChanged = base.width !== head.width || base.height !== head.height;

  const a = crop(base.data, base.width, w, h);
  // The head is written to (ignored areas), so it is always a copy.
  const b = head.width === w ? Buffer.from(head.data.subarray(0, w * h * 4)) : crop(head.data, head.width, w, h);
  applyIgnore(b, a, w, h, opts.ignore);

  const mask = Buffer.alloc(w * h * 4);
  const overlapChanged = pixelmatch(a, b, mask, w, h, { threshold: opts.threshold ?? DEFAULT_DIFF_THRESHOLD, includeAA: false, diffMask: true, diffColor: [229, 20, 0] });

  const canvasW = Math.max(base.width, head.width);
  const canvasH = Math.max(base.height, head.height);
  const totalPixels = canvasW * canvasH;
  const extra = totalPixels - w * h;
  const changedPixels = overlapChanged + extra;

  const found = overlapChanged ? findRegions(w, h, (i) => mask[i * 4 + 3] !== 0) : { regions: [], truncated: false };
  let regions = found.regions;
  // What only the head covers is a change of its own; what only the base covered is gone (the head is shorter or narrower).
  const outside: DiffRegion[] = [];
  if (head.width > w) outside.push({ x: w, y: 0, width: head.width - w, height: head.height, pixels: (head.width - w) * head.height });
  if (head.height > h) outside.push({ x: 0, y: h, width: w, height: head.height - h, pixels: w * (head.height - h) });
  if (outside.length) regions = mergeOverlapping([...regions, ...outside]).sort(readingOrder);

  const shift = changedPixels > 0 && base.width === head.width ? detectShift(rowHashes(base.data, base.width, base.height), rowHashes(head.data, head.width, head.height)) : null;

  let overlay: Buffer | null = null;
  if (changedPixels > 0 && (opts.overlay ?? true)) {
    const out = Buffer.alloc(head.width * head.height * 4);
    for (let y = 0; y < h; y++) mask.copy(out, y * head.width * 4, y * w * 4, (y + 1) * w * 4);
    for (const r of outside) {
      for (let y = r.y; y < r.y + r.height; y++) {
        for (let x = r.x; x < r.x + r.width; x++) {
          const p = (y * head.width + x) * 4;
          out[p] = 229;
          out[p + 1] = 20;
          out[p + 2] = 0;
          out[p + 3] = 90;
        }
      }
    }
    overlay = await sharp(out, { raw: { width: head.width, height: head.height, channels: 4 }, limitInputPixels: false })
      .png({ palette: true, colours: 4, compressionLevel: 9, effort: 1 })
      .toBuffer();
  }

  return {
    changedPixels,
    totalPixels,
    ratio: totalPixels ? changedPixels / totalPixels : 0,
    base: baseSize,
    head: headSize,
    sizeChanged,
    regions,
    regionsTruncated: found.truncated,
    shift,
    overlay,
  };
}
