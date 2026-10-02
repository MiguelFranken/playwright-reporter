/**
 * Review images for machines: a screenshot with its comment threads drawn on
 * it as numbered pins (and the areas they mark), and close-ups around each
 * pin — what an AI assistant needs to connect "thread 2: the totals lost their
 * border" to a place on the page, the way a person sees it in the viewer.
 *
 * Pins are drawn as SVG composited onto the image. The digits are strokes,
 * not text: serverless runtimes ship without fonts, and a missing font would
 * draw nothing. The image is scaled to what a model can read (a full page
 * shrinks), and encoded to fit the inline-image budget.
 */
import sharp, { type Sharp } from 'sharp';
import type { FractionAnchor, ImageSize, ThreadPlacement, ThreadStatus } from '@miguelfranken/ui/lib/review-threads';
import { arrowHead, isStroke, MARKUP_INK, pairs, strokePath, type MarkupShape } from '@miguelfranken/ui/lib/review-markup';

export interface PinSpec {
  number: number;
  status: ThreadStatus;
  placement: ThreadPlacement;
  /** In fractions of the image. */
  anchor: FractionAnchor;
  /** What was drawn with the comment, in fractions of the image; drawn in its colours instead of the area. */
  markup?: MarkupShape[] | null;
}

export interface EncodedImage {
  data: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

export interface AnnotatedImage extends EncodedImage {
  /** The source image's size. */
  source: ImageSize;
  /** Output pixels per source pixel. */
  scale: number;
}

export interface Crop extends EncodedImage {
  number: number;
  /** The region shown, in source pixels. */
  region: { x: number; y: number; w: number; h: number };
}

const COLORS = { open: '#2563eb', resolved: '#6b7280' } as const;

/** Seven segments on a 6 × 10 grid: enough for every digit, drawn as strokes. */
const SEGMENTS = {
  a: [0, 0, 6, 0],
  b: [6, 0, 6, 5],
  c: [6, 5, 6, 10],
  d: [0, 10, 6, 10],
  e: [0, 5, 0, 10],
  f: [0, 0, 0, 5],
  g: [0, 5, 6, 5],
} as const;
const DIGITS: Record<string, (keyof typeof SEGMENTS)[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'd', 'c'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
};

function digitsPath(text: string, x: number, y: number, unit: number): string {
  const advance = 9 * unit;
  return [...text]
    .map((ch, i) =>
      (DIGITS[ch] ?? [])
        .map((s) => {
          const [x1, y1, x2, y2] = SEGMENTS[s];
          const ox = x + i * advance;
          return `M${(ox + x1 * unit).toFixed(1)} ${(y + y1 * unit).toFixed(1)}L${(ox + x2 * unit).toFixed(1)} ${(y + y2 * unit).toFixed(1)}`;
        })
        .join(''),
    )
    .join('');
}

/**
 * One pin as SVG, its sharp bottom-left corner on `(px, py)`: a bubble with
 * the number in it, a white ring and a shadow so it reads on any page.
 */
function pinSvg(pin: PinSpec, px: number, py: number, radius: number): string {
  const color = pin.status === 'resolved' ? COLORS.resolved : COLORS.open;
  const outdated = pin.placement === 'outdated' && pin.status === 'open';
  const label = String(pin.number);
  const unit = radius * 0.085;
  const textW = (label.length * 9 - 3) * unit;
  const w = Math.max(radius * 2, textW + radius * 1.1);
  const h = radius * 2;
  // Kept inside the image, like the app's pins.
  const left = px;
  const top = py - h;
  const r = radius;
  const bubble = `M${left} ${top + r}A${r} ${r} 0 0 1 ${left + r} ${top}H${left + w - r}A${r} ${r} 0 0 1 ${left + w} ${top + r}A${r} ${r} 0 0 1 ${left + w - r} ${top + h}H${left + 2}Q${left} ${top + h} ${left} ${top + h - 2}Z`;
  const fill = outdated ? '#ffffff' : color;
  const ink = outdated ? color : '#ffffff';
  const stroke = outdated ? `stroke="${color}" stroke-width="${(unit * 2).toFixed(1)}" stroke-dasharray="${(unit * 4).toFixed(1)} ${(unit * 3).toFixed(1)}"` : `stroke="#ffffff" stroke-width="${(unit * 2.5).toFixed(1)}"`;
  const digits = digitsPath(label, left + (w - textW) / 2, top + (h - 10 * unit) / 2, unit);
  return `<g filter="url(#shadow)"><path d="${bubble}" fill="${fill}" ${stroke}/></g><path d="${digits}" fill="none" stroke="${ink}" stroke-width="${(unit * 1.7).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function areaSvg(pin: PinSpec, x: number, y: number, w: number, h: number, weight: number): string {
  const color = pin.status === 'resolved' ? COLORS.resolved : COLORS.open;
  const dash = pin.placement === 'outdated' ? ` stroke-dasharray="${weight * 3} ${weight * 2}"` : '';
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${weight}" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="${weight}"${dash}/>`;
}

/** A thread's drawing, faded when the thread is resolved. */
const markupSvg = (pin: PinSpec, toX: (f: number) => number, toY: (f: number) => number, weight: number) => shapesSvg(pin.markup ?? [], toX, toY, weight, pin.status === 'resolved');

/**
 * Shapes in the colours they were drawn in, the way the app draws them:
 * strokes with round ends, a translucent highlighter, arrows with a head.
 * `weight` is the pen's width in output pixels.
 */
function shapesSvg(shapes: readonly MarkupShape[], toX: (f: number) => number, toY: (f: number) => number, weight: number, faded = false): string {
  if (!shapes.length) return '';
  const muted = faded ? ' opacity="0.5"' : '';
  const svg = (shape: MarkupShape) => {
    const ink = MARKUP_INK[shape.color];
    const pts = pairs(shape.points).map(([x, y]) => [toX(x), toY(y)] as const);
    if (isStroke(shape.tool)) {
      const d = strokePath(pts.flat(), 1);
      const highlighter = shape.tool === 'highlighter';
      return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${(highlighter ? weight * 4.5 : weight).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"${highlighter ? ' stroke-opacity="0.4"' : ''}/>`;
    }
    const [[x1, y1], [x2, y2]] = pts;
    const stroke = `fill="none" stroke="${ink}" stroke-width="${weight.toFixed(1)}"`;
    if (shape.tool === 'arrow') {
      const head = arrowHead(x1, y1, x2, y2, weight * 4.5);
      const [hx, hy] = [(head[1][0] + head[2][0]) / 2, (head[1][1] + head[2][1]) / 2];
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${hx.toFixed(1)} ${hy.toFixed(1)}" ${stroke} stroke-linecap="round"/><path d="M${head.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z" fill="${ink}" stroke="${ink}" stroke-width="${(weight / 2).toFixed(1)}" stroke-linejoin="round"/>`;
    }
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    if (shape.tool === 'rect') return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${weight.toFixed(1)}" ${stroke}/>`;
    return `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" ${stroke}/>`;
  };
  const marker = shapes.filter((s) => s.tool === 'highlighter').map(svg);
  const ink = shapes.filter((s) => s.tool !== 'highlighter').map(svg);
  // A white halo around the lines keeps them apart from the page, as the pins' ring does; a highlighter shows the page through it.
  return `<g${muted}>${marker.join('')}${ink.length ? `<g filter="url(#halo)">${ink.join('')}</g>` : ''}</g>`;
}

/** The overlay of every pin on an image of `width` × `height`: drawings on their own, then threads' drawings and areas, under pins in number order. */
function overlaySvg(pins: readonly PinSpec[], width: number, height: number, origin = { x: 0, y: 0, w: 1, h: 1 }, loose: readonly MarkupShape[] = []): Buffer {
  const radius = Math.round(Math.min(24, Math.max(14, width / 60)));
  const weight = Math.max(2, Math.round(radius / 5));
  const toX = (f: number) => ((f - origin.x) / origin.w) * width;
  const toY = (f: number) => ((f - origin.y) / origin.h) * height;
  const drawn = pins.filter((p) => p.anchor.kind !== 'image').sort((a, b) => a.number - b.number);
  const pen = Math.max(2.5, Math.min(6, width / 320));
  const drawings = [shapesSvg(loose, toX, toY, pen), ...drawn.filter((p) => p.markup?.length).map((p) => markupSvg(p, toX, toY, pen))];
  const areas = drawn
    .filter((p) => !p.markup?.length && p.anchor.kind === 'area' && p.anchor.w != null && p.anchor.h != null)
    .map((p) => areaSvg(p, toX(p.anchor.x), toY(p.anchor.y), (p.anchor.w! / origin.w) * width, (p.anchor.h! / origin.h) * height, weight));
  const marks = drawn.map((p) => {
    const x = Math.min(Math.max(toX(p.anchor.x), 0), width - radius * 2 - 2);
    const y = Math.min(Math.max(toY(p.anchor.y), radius * 2 + 2), height);
    return pinSvg(p, x, y, radius);
  });
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.45"/></filter><filter id="halo" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="grown"/><feFlood flood-color="#fff" flood-opacity="0.85"/><feComposite in2="grown" operator="in" result="ring"/><feMerge><feMergeNode in="ring"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${drawings.join('')}${areas.join('')}${marks.join('')}</svg>`,
  );
}

/** PNG while it fits, else JPEG at falling quality: text in screenshots stays readable as long as possible. */
async function encode(image: Sharp, maxBytes: number): Promise<{ data: Buffer; mimeType: EncodedImage['mimeType'] }> {
  const png = await image.clone().png({ compressionLevel: 9, palette: true }).toBuffer();
  if (png.byteLength <= maxBytes) return { data: png, mimeType: 'image/png' };
  for (const quality of [85, 72, 60, 45]) {
    const jpeg = await image.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (jpeg.byteLength <= maxBytes || quality === 45) return { data: jpeg, mimeType: 'image/jpeg' };
  }
  throw new Error('unreachable');
}

export interface AnnotateOptions {
  /** Widest output, in pixels. */
  maxWidth?: number;
  /** Most output pixels: a tall full page shrinks until it fits. */
  maxPixels?: number;
  maxBytes: number;
  /** Drawings on the image, on their own, in fractions of it: drawn under the pins. */
  drawings?: readonly MarkupShape[];
}

/** The image scaled for a model, with the pins (and drawings) drawn on it. Both may be empty: then it is only scaled. */
export async function annotate(bytes: Uint8Array, pins: readonly PinSpec[], opts: AnnotateOptions): Promise<AnnotatedImage> {
  const input = sharp(bytes, { limitInputPixels: 268_402_689 });
  const meta = await input.metadata();
  const source = { width: meta.width ?? 1, height: meta.height ?? 1 };
  const maxWidth = opts.maxWidth ?? 1280;
  const maxPixels = opts.maxPixels ?? 2_400_000;
  const scale = Math.min(1, maxWidth / source.width, Math.sqrt(maxPixels / (source.width * source.height)));
  const width = Math.max(1, Math.floor(source.width * scale));
  const height = Math.max(1, Math.floor(source.height * scale));
  let image: Sharp = input.resize(width, height, { fit: 'fill' });
  const drawings = opts.drawings ?? [];
  if (pins.some((p) => p.anchor.kind !== 'image') || drawings.length) {
    const flat = await image.png().toBuffer();
    image = sharp(flat).composite([{ input: overlaySvg(pins, width, height, undefined, drawings), top: 0, left: 0 }]);
  }
  return { ...(await encode(image, opts.maxBytes)), width, height, source, scale };
}

/**
 * A close-up around one pin at the source's own resolution (shrunk to
 * `maxWidth`): the spot with room around it, or the area with a margin.
 */
export async function cropAround(bytes: Uint8Array, pin: PinSpec, allPins: readonly PinSpec[], opts: { maxWidth?: number; maxBytes: number; drawings?: readonly MarkupShape[] }): Promise<Crop | null> {
  if (pin.anchor.kind === 'image') return null;
  const input = sharp(bytes, { limitInputPixels: 268_402_689 });
  const meta = await input.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return null;
  const a = pin.anchor;
  const minW = Math.min(W, Math.max(560, Math.round(W * 0.35)));
  const minH = Math.min(H, Math.round(minW * 0.62));
  let cx: number, cy: number, w: number, h: number;
  if (a.kind === 'area' && a.w != null && a.h != null) {
    w = Math.min(W, Math.max(minW, Math.round(a.w * W * 1.8)));
    h = Math.min(H, Math.max(minH, Math.round(a.h * H * 1.8)));
    cx = (a.x + a.w / 2) * W;
    cy = (a.y + a.h / 2) * H;
  } else {
    w = minW;
    h = minH;
    cx = a.x * W;
    cy = a.y * H;
  }
  const x = Math.round(Math.min(Math.max(cx - w / 2, 0), W - w));
  const y = Math.round(Math.min(Math.max(cy - h / 2, 0), H - h));
  const region = { x, y, w: Math.round(w), h: Math.round(h) };
  const maxWidth = opts.maxWidth ?? 800;
  const outW = Math.min(region.w, maxWidth);
  const outH = Math.round((region.h * outW) / region.w);
  const origin = { x: region.x / W, y: region.y / H, w: region.w / W, h: region.h / H };
  // Every pin inside the close-up is drawn, so neighbours are not mistaken for the thread's spot.
  const inside = allPins.filter((p) => p.anchor.kind !== 'image' && p.anchor.x >= origin.x && p.anchor.x <= origin.x + origin.w && p.anchor.y >= origin.y && p.anchor.y <= origin.y + origin.h);
  const base = await input.extract({ left: region.x, top: region.y, width: region.w, height: region.h }).resize(outW, outH).png().toBuffer();
  const image = sharp(base).composite([{ input: overlaySvg(inside.length ? inside : [pin], outW, outH, origin, opts.drawings), top: 0, left: 0 }]);
  return { ...(await encode(image, opts.maxBytes)), width: outW, height: outH, number: pin.number, region };
}
