/**
 * Images of a visual comparison for machines: the head with its changed
 * regions boxed and numbered (`D1`, `D2`…), the same rectangle of base and
 * head as a readable pair, the changed pixels painted over the head, the
 * threshold mask, the colour difference, the two images faded over each
 * other, or an image as it is — whole, or one rectangle of it.
 *
 * Everything here is sharp (libvips) compositing on the stored pixels: no
 * browser, no model. Where a mode needs the changed pixels, the stored
 * overlay of the measurement is used (the exact mask the numbers come from);
 * without one, pixelmatch runs on the rectangle asked for, with the
 * project's threshold, and the result says so.
 *
 * Coordinates in and out are the image's own pixels, origin top-left. An
 * output is scaled down to be readable, never up, and every result carries
 * the rectangle it shows and the scale it was drawn at.
 */
import pixelmatch from 'pixelmatch';
import sharp, { type Sharp } from 'sharp';
import { intersection, type MaskPolicy, type Rect, type VisualDiffMode, type VisualDiffRegion } from '@miguelfranken/ui/lib/visual-diff';
import { digitsPath, encodeForModel, type EncodedImage } from '../annotate';
import { readCaptureBytes } from '../images';
import type { CaptureRecord } from '../queries';

export interface RenderSource {
  captureId: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** The pixels of a capture as the renderer reads them, or `null` when the image is not stored (or not an image). */
export async function loadSource(capture: CaptureRecord): Promise<RenderSource | null> {
  const source = await readCaptureBytes(capture);
  if (!source) return null;
  try {
    const meta = await sharp(source.bytes, { limitInputPixels: false }).metadata();
    if (!meta.width || !meta.height) return null;
    return { captureId: capture.id, bytes: source.bytes, width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/** Widest a crop goes out at; a longer region is tiled instead of shrunk. */
export const CROP_MAX_SIDE = 1024;
/** Tiles of a long region overlap this much, so nothing is cut in half at a seam. */
export const TILE_OVERLAP = 32;
/** Context around a region, in CSS pixels; multiplied by the capture's scale when known. */
export const DEFAULT_CONTEXT_PADDING = 24;
/** The most pixels pixelmatch runs over ad hoc, when no stored overlay covers a rectangle. */
export const ADHOC_MASK_MAX_PIXELS = 8_000_000;

export const OVERVIEW = { maxWidth: 1280, maxPixels: 2_400_000 } as const;

export class RenderError extends Error {}

export interface RenderSpec {
  mode: Exclude<VisualDiffMode, 'pair'>;
  /** Which image a single-image mode shows; the two-image modes are always `both`. */
  side: 'base' | 'head';
  /** The rectangle to show, in the side's pixels; `null` for the whole image, scaled to the overview size. */
  rect: Rect | null;
  /** For `annotated`: the regions to box; others are left out. */
  regions?: readonly VisualDiffRegion[];
  /** For `annotated`: hatch the areas left out. */
  ignored?: readonly Rect[];
  maxBytes: number;
}

export interface Rendered extends EncodedImage {
  side: 'base' | 'head' | 'both';
  /** What the output shows, in the side's pixels (the head's for two-image modes). */
  sourceRect: Rect;
  /** Output pixels per source pixel. */
  scale: number;
  /** For modes that need the changed pixels: where they came from. */
  maskSource: 'measurement' | 'computed' | null;
}

export interface RenderContext {
  base: RenderSource | null;
  head: RenderSource | null;
  /** The stored overlay of the measurement (the head's size, changed pixels opaque), for the mask policy asked for. */
  overlay: Buffer | null;
  threshold: number;
  policy: MaskPolicy;
  /** With `effective`: the rectangles the measurement left out, copied from the base so they compare equal. */
  ignore: readonly Rect[];
}

const RED = [229, 20, 0] as const;

/** A rectangle clamped to an image; `null` when nothing of it lies inside. */
export function clampRect(r: Rect, size: { width: number; height: number }): Rect | null {
  return intersection({ x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) }, { x: 0, y: 0, width: size.width, height: size.height });
}

/** A rectangle grown by `padding` on each side, within an image. */
export function padRect(r: Rect, padding: number, size: { width: number; height: number }): Rect {
  return clampRect({ x: r.x - padding, y: r.y - padding, width: r.width + padding * 2, height: r.height + padding * 2 }, size) ?? r;
}

/** A long rectangle as tiles of at most `max` a side, overlapping by `overlap`; a short one is itself. */
export function tilesOf(r: Rect, max = CROP_MAX_SIDE, overlap = TILE_OVERLAP): Rect[] {
  const steps = (length: number) => {
    if (length <= max) return [0];
    const out: number[] = [];
    for (let at = 0; at < length - overlap; at += max - overlap) out.push(Math.min(at, length - max));
    return [...new Set(out)];
  };
  const out: Rect[] = [];
  for (const dy of steps(r.height)) for (const dx of steps(r.width)) out.push({ x: r.x + dx, y: r.y + dy, width: Math.min(max, r.width - dx), height: Math.min(max, r.height - dy) });
  return out;
}

/** The scale an image of `size` is drawn at to fit the limits, never above 1. */
function fitScale(size: { width: number; height: number }, limits: { maxWidth: number; maxPixels: number }) {
  return Math.min(1, limits.maxWidth / size.width, Math.sqrt(limits.maxPixels / (size.width * size.height)));
}

function limitsFor(spec: RenderSpec) {
  return spec.rect ? { maxWidth: CROP_MAX_SIDE, maxPixels: CROP_MAX_SIDE * CROP_MAX_SIDE } : OVERVIEW;
}

const sideOf = (ctx: RenderContext, side: 'base' | 'head') => (side === 'base' ? ctx.base : ctx.head);

async function extractRaw(source: RenderSource, rect: Rect) {
  const { data, info } = await sharp(source.bytes, { limitInputPixels: false }).extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Both images over the same rectangle (the head's pixels), as raw RGBA: what the two-image modes work on. */
async function bothRaw(ctx: RenderContext, rect: Rect) {
  if (!ctx.base || !ctx.head) throw new RenderError('Both images are needed for this mode.');
  const inHead = clampRect(rect, ctx.head);
  const inBase = inHead ? clampRect(inHead, ctx.base) : null;
  if (!inHead || !inBase) throw new RenderError('The rectangle lies outside the images.');
  const shared = intersection(inHead, inBase)!;
  const [base, head] = await Promise.all([extractRaw(ctx.base, shared), extractRaw(ctx.head, shared)]);
  return { rect: shared, base, head };
}

/** The changed pixels of a rectangle: from the stored overlay when there is one, else measured now. */
async function maskFor(ctx: RenderContext, rect: Rect, base: { data: Buffer }, head: { data: Buffer }): Promise<{ mask: Buffer; source: 'measurement' | 'computed' }> {
  if (ctx.overlay) {
    const { data } = await sharp(ctx.overlay, { limitInputPixels: false }).extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const mask = Buffer.alloc(rect.width * rect.height);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] !== 0 ? 255 : 0;
    return { mask, source: 'measurement' };
  }
  if (rect.width * rect.height > ADHOC_MASK_MAX_PIXELS) throw new RenderError(`No stored measurement covers this rectangle, and ${rect.width}×${rect.height} is too large to measure on the fly: ask for a region or a smaller crop.`);
  const b = Buffer.from(head.data);
  if (ctx.policy === 'effective') {
    for (const r of ctx.ignore) {
      const i = intersection(r, rect);
      if (!i) continue;
      for (let y = i.y - rect.y; y < i.y - rect.y + i.height; y++) base.data.copy(b, (y * rect.width + (i.x - rect.x)) * 4, (y * rect.width + (i.x - rect.x)) * 4, (y * rect.width + (i.x - rect.x) + i.width) * 4);
    }
  }
  const out = Buffer.alloc(rect.width * rect.height * 4);
  pixelmatch(base.data, b, out, rect.width, rect.height, { threshold: ctx.threshold, includeAA: false, diffMask: true, diffColor: [...RED] });
  const mask = Buffer.alloc(rect.width * rect.height);
  for (let i = 0; i < mask.length; i++) mask[i] = out[i * 4 + 3] !== 0 ? 255 : 0;
  return { mask, source: 'computed' };
}

async function finish(image: Sharp, out: { width: number; height: number }, spec: RenderSpec, side: Rendered['side'], sourceRect: Rect, scale: number, maskSource: Rendered['maskSource']): Promise<Rendered> {
  return { ...(await encodeForModel(image, spec.maxBytes)), width: out.width, height: out.height, side, sourceRect, scale, maskSource };
}

/** Output size of a rectangle at the limits. */
function outputSize(rect: Rect, spec: RenderSpec) {
  const scale = fitScale(rect, limitsFor(spec));
  return { scale, width: Math.max(1, Math.floor(rect.width * scale)), height: Math.max(1, Math.floor(rect.height * scale)) };
}

/**
 * The boxes and labels over an image of `out` size showing `rect` of the
 * source: regions in red with `D<n>` badges, areas left out hatched in grey.
 */
export function regionsSvg(regions: readonly VisualDiffRegion[], ignored: readonly Rect[], rect: Rect, out: { width: number; height: number; scale: number }, side: 'base' | 'head'): Buffer {
  const sx = out.scale;
  const toX = (x: number) => (x - rect.x) * sx;
  const toY = (y: number) => (y - rect.y) * sx;
  const weight = Math.max(1.5, Math.min(4, out.width / 320));
  const unit = Math.max(1.2, Math.min(2.4, out.width / 500));
  const parts: string[] = [];
  for (const r of ignored) {
    const i = intersection(r, rect);
    if (!i) continue;
    parts.push(`<rect x="${toX(i.x).toFixed(1)}" y="${toY(i.y).toFixed(1)}" width="${(i.width * sx).toFixed(1)}" height="${(i.height * sx).toFixed(1)}" fill="url(#hatch)" stroke="#6b7280" stroke-width="${weight}" stroke-dasharray="${weight * 3} ${weight * 2}"/>`);
  }
  for (const region of regions) {
    const box = side === 'head' ? region.headRect : region.baseRect;
    if (!box) continue;
    const i = intersection(box, rect);
    if (!i) continue;
    const x = toX(i.x);
    const y = toY(i.y);
    const w = Math.max(2, i.width * sx);
    const h = Math.max(2, i.height * sx);
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="${weight + 2}"/>`);
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="#e51400" stroke-width="${weight}"/>`);
    // The badge sits above the box's top-left corner, inside the image.
    const label = region.label;
    const textW = (label.length * 9 - 3) * unit;
    const bw = textW + 8 * unit;
    const bh = 14 * unit;
    const bx = Math.min(Math.max(0, x), out.width - bw);
    const by = Math.max(0, y - bh - weight);
    parts.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(2 * unit).toFixed(1)}" fill="#e51400" stroke="#ffffff" stroke-width="${(unit * 1.2).toFixed(1)}"/>`);
    parts.push(`<path d="${digitsPath(label, bx + 4 * unit, by + 2 * unit, unit)}" fill="none" stroke="#ffffff" stroke-width="${(unit * 1.7).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${out.width}" height="${out.height}" viewBox="0 0 ${out.width} ${out.height}"><defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#9ca3af" fill-opacity="0.18"/><line x1="0" y1="0" x2="0" y2="8" stroke="#6b7280" stroke-opacity="0.7" stroke-width="2"/></pattern></defs>${parts.join('')}</svg>`,
  );
}

/** Renders one image of the comparison. Throws `RenderError` when the images cannot show what was asked. */
export async function render(spec: RenderSpec, ctx: RenderContext): Promise<Rendered> {
  if (spec.mode === 'base' || spec.mode === 'head' || spec.mode === 'annotated') {
    const side = spec.mode === 'annotated' ? spec.side : spec.mode;
    const source = sideOf(ctx, side);
    if (!source) throw new RenderError(`The ${side} image is not stored.`);
    const rect = spec.rect ? clampRect(spec.rect, source) : { x: 0, y: 0, width: source.width, height: source.height };
    if (!rect) throw new RenderError(`The rectangle lies outside the ${side} image.`);
    const out = outputSize(rect, spec);
    let image = sharp(source.bytes, { limitInputPixels: false }).extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height }).resize(out.width, out.height, { fit: 'fill' });
    if (spec.mode === 'annotated') {
      const flat = await image.png().toBuffer();
      image = sharp(flat).composite([{ input: regionsSvg(spec.regions ?? [], spec.ignored ?? [], rect, out, side), top: 0, left: 0 }]);
    }
    return finish(image, out, spec, side, rect, out.scale, null);
  }

  const wanted = spec.rect ?? (ctx.head ? { x: 0, y: 0, width: ctx.head.width, height: ctx.head.height } : null);
  if (!wanted) throw new RenderError('The head image is not stored.');
  const { rect, base, head } = await bothRaw(ctx, wanted);
  const out = outputSize(rect, spec);
  const rawOpts = { raw: { width: rect.width, height: rect.height, channels: 4 as const }, limitInputPixels: false };

  if (spec.mode === 'difference') {
    const image = sharp(base.data, rawOpts).composite([{ input: head.data, raw: rawOpts.raw, blend: 'difference' }]).removeAlpha().resize(out.width, out.height, { fit: 'fill' });
    return finish(image, out, spec, 'both', rect, out.scale, null);
  }
  if (spec.mode === 'onion') {
    const faded = Buffer.from(head.data);
    for (let i = 3; i < faded.length; i += 4) faded[i] = faded[i] >> 1;
    const image = sharp(base.data, rawOpts).composite([{ input: faded, raw: rawOpts.raw, blend: 'over' }]).resize(out.width, out.height, { fit: 'fill' });
    return finish(image, out, spec, 'both', rect, out.scale, null);
  }

  const { mask, source } = await maskFor(ctx, rect, base, head);
  if (spec.mode === 'mask') {
    const image = sharp(mask, { raw: { width: rect.width, height: rect.height, channels: 1 }, limitInputPixels: false }).resize(out.width, out.height, { fit: 'fill', kernel: 'nearest' });
    return finish(image, out, spec, 'both', rect, out.scale, source);
  }
  // highlight: the head with the changed pixels painted red, at 70% so what is under them still reads.
  const paint = Buffer.alloc(rect.width * rect.height * 4);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    paint[i * 4] = RED[0];
    paint[i * 4 + 1] = RED[1];
    paint[i * 4 + 2] = RED[2];
    paint[i * 4 + 3] = 180;
  }
  const image = sharp(head.data, rawOpts).composite([{ input: paint, raw: rawOpts.raw, blend: 'over' }]).resize(out.width, out.height, { fit: 'fill' });
  return finish(image, out, spec, 'both', rect, out.scale, source);
}
