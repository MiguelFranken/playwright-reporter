/**
 * Which images answer a request for a comparison's pictures: the whole head
 * boxed, one base/head pair per region (tiled when long), or one rectangle.
 * The plan is pure data, so the MCP tool (inline images), the REST manifest
 * (signed links) and the route that serves a link all agree on what image
 * number three of a request is. Every image is one `RenderSpec` plus its
 * place in the answer.
 */
import { type MaskPolicy, type Rect, type VisualDiffMode, type VisualDiffRegion, type VisualDiffScope } from '@miguelfranken/ui/lib/visual-diff';
import { CROP_MAX_SIDE, DEFAULT_CONTEXT_PADDING, padRect, tilesOf } from './render';

export const DEFAULT_MAX_IMAGES = 3;
export const MAX_IMAGES = 8;

export interface ImageRequest {
  mode: VisualDiffMode;
  scope: VisualDiffScope;
  /** `regions`: which; empty for the first ones in `order`. */
  regionIds: readonly string[];
  order: 'reading' | 'largest';
  /** `crop`: the rectangle, in `space` pixels. */
  crop: (Rect & { space: 'base' | 'head' }) | null;
  /** Around a region, in CSS pixels; scaled by the capture's device scale factor when known. */
  contextPadding: number;
  maxImages: number;
  captureScale: number | null;
  sizes: { base: { width: number; height: number } | null; head: { width: number; height: number } | null };
}

export interface PlannedImage {
  role: 'overview' | 'region' | 'crop';
  mode: Exclude<VisualDiffMode, 'pair'>;
  side: 'base' | 'head';
  /** In the side's pixels; `null` for the whole image. */
  rect: Rect | null;
  regionIds: string[];
  /** What the image is, in words, for the text beside it. */
  label: string;
  /** Tile `n` of `of` when a region was split. */
  tile: { n: number; of: number } | null;
}

export interface ImagePlan {
  images: PlannedImage[];
  /** Regions that did not fit the image budget, so the caller can ask again with them. */
  nextRegionIds: string[];
  omitted: string[];
  warnings: string[];
}

const sideLabel = (side: 'base' | 'head') => (side === 'base' ? 'base' : 'head');

/** The images for a request, within its budget. */
export function planImages(req: ImageRequest, regions: readonly VisualDiffRegion[]): ImagePlan {
  const images: PlannedImage[] = [];
  const omitted: string[] = [];
  const warnings: string[] = [];
  const pair = req.mode === 'pair';
  const single = (mode: VisualDiffMode): Exclude<VisualDiffMode, 'pair'> => (mode === 'pair' ? 'head' : mode);
  const bothSides = pair ? (['base', 'head'] as const) : ([single(req.mode) === 'base' ? 'base' : 'head'] as const);

  if (req.scope === 'overview') {
    for (const side of bothSides) {
      if (!req.sizes[side]) {
        omitted.push(`the ${sideLabel(side)} image is not stored`);
        continue;
      }
      images.push({ role: 'overview', mode: single(req.mode === 'pair' ? side : req.mode), side, rect: null, regionIds: regions.map((r) => r.id), label: pair ? `the whole ${sideLabel(side)} image` : `the whole ${sideLabel(side)} image, ${describeMode(req.mode)}`, tile: null });
    }
    return { images: images.slice(0, req.maxImages), nextRegionIds: [], omitted: [...omitted, ...images.slice(req.maxImages).map((i) => i.label)], warnings };
  }

  if (req.scope === 'crop') {
    if (!req.crop) return { images: [], nextRegionIds: [], omitted: ['no rectangle given'], warnings: ['scope "crop" needs "crop".'] };
    const { space, ...rect } = req.crop;
    for (const side of bothSides) {
      const size = req.sizes[side];
      if (!size) {
        omitted.push(`the ${sideLabel(side)} image is not stored`);
        continue;
      }
      if (space !== side && req.mode !== 'pair' && single(req.mode) !== side) continue;
      for (const [i, tile] of tilesOf(rect).entries()) images.push({ role: 'crop', mode: single(req.mode === 'pair' ? side : req.mode), side, rect: tile, regionIds: [], label: `${rect.width}×${rect.height} at ${rect.x},${rect.y} of the ${sideLabel(side)} image${tilesOf(rect).length > 1 ? `, part ${i + 1}` : ''}`, tile: tilesOf(rect).length > 1 ? { n: i + 1, of: tilesOf(rect).length } : null });
    }
    if (bothSides.length === 1 && bothSides[0] !== space) warnings.push(`The rectangle is in ${space} pixels; it was applied to the ${bothSides[0]} image as given.`);
    return { images: images.slice(0, req.maxImages), nextRegionIds: [], omitted: [...omitted, ...images.slice(req.maxImages).map((i) => i.label)], warnings };
  }

  // scope: regions
  const chosen = req.regionIds.length ? req.regionIds.map((id) => regions.find((r) => r.id === id || r.label === id)).filter((r): r is VisualDiffRegion => Boolean(r)) : [...regions].sort(req.order === 'largest' ? (a, b) => b.rawChangedPixels - a.rawChangedPixels : () => 0);
  const unknown = req.regionIds.filter((id) => !regions.some((r) => r.id === id || r.label === id));
  if (unknown.length) warnings.push(`No such region: ${unknown.join(', ')}. Regions are listed by get_visual_diff.`);
  if (regions.length === 0) warnings.push('No changed regions are measured for this comparison.');
  const padding = Math.round(req.contextPadding * (req.captureScale ?? 1));
  const next: string[] = [];
  for (const region of chosen) {
    const side: 'base' | 'head' = region.headRect ? 'head' : 'base';
    const box = region.headRect ?? region.baseRect;
    if (!box) continue;
    const size = req.sizes[side];
    if (!size) {
      omitted.push(`${region.label}: the ${sideLabel(side)} image is not stored`);
      continue;
    }
    const padded = padRect(box, padding, size);
    const tiles = tilesOf(padded);
    const sides = region.headRect ? bothSides : (['base'] as const);
    const needed = tiles.length * sides.length;
    if (images.length + needed > req.maxImages) {
      if (images.length === 0 && needed > req.maxImages) {
        // One region alone is over the budget: send what fits and say so, rather than nothing.
        warnings.push(`${region.label} needs ${needed} images at full resolution; only the first ${req.maxImages} are attached. Ask again with a higher maxImages or a crop.`);
      } else {
        next.push(region.id);
        continue;
      }
    }
    for (const [i, tile] of tiles.entries()) {
      for (const s of sides) {
        if (images.length >= req.maxImages) break;
        const tileRect = s === 'base' && region.headRect ? tile : tile;
        images.push({
          role: 'region',
          mode: pair ? (s === 'base' ? 'base' : 'head') : single(req.mode),
          side: s,
          rect: tileRect,
          regionIds: [region.id],
          label: `${region.label}${region.kind === 'removed-area' ? ' (area only the base has)' : region.kind === 'added-area' ? ' (area only the head has)' : ''}, ${pair ? sideLabel(s) : describeMode(req.mode)}${tiles.length > 1 ? `, part ${i + 1} of ${tiles.length}` : ''}`,
          tile: tiles.length > 1 ? { n: i + 1, of: tiles.length } : null,
        });
      }
    }
  }
  return { images, nextRegionIds: next, omitted, warnings };
}

export function describeMode(mode: VisualDiffMode): string {
  switch (mode) {
    case 'annotated':
      return 'regions boxed and numbered';
    case 'pair':
      return 'base and head';
    case 'highlight':
      return 'changed pixels painted red';
    case 'mask':
      return 'mask (white where changed)';
    case 'difference':
      return 'colour difference';
    case 'onion':
      return 'head faded over base';
    case 'base':
      return 'base as it is';
    case 'head':
      return 'head as it is';
  }
}

/** The query string that names one planned image, for a signed link; `parseSpecQuery` reads it back. */
export function specQuery(img: PlannedImage, opts: { policy: MaskPolicy; showIgnored: boolean; revision: string | null }): URLSearchParams {
  const q = new URLSearchParams({ mode: img.mode, side: img.side, policy: opts.policy, ignored: opts.showIgnored ? '1' : '0' });
  if (img.rect) q.set('rect', [img.rect.x, img.rect.y, img.rect.width, img.rect.height].join(','));
  if (img.regionIds.length && img.mode === 'annotated') q.set('regions', img.regionIds.join(','));
  if (opts.revision) q.set('rev', opts.revision);
  return q;
}

export function parseSpecQuery(q: URLSearchParams): { mode: Exclude<VisualDiffMode, 'pair'>; side: 'base' | 'head'; rect: Rect | null; regionIds: string[]; policy: MaskPolicy; showIgnored: boolean; revision: string | null } | null {
  const mode = q.get('mode');
  const side = q.get('side');
  if (!mode || mode === 'pair' || !['annotated', 'highlight', 'mask', 'difference', 'onion', 'base', 'head'].includes(mode)) return null;
  if (side !== 'base' && side !== 'head') return null;
  const rectRaw = q.get('rect');
  let rect: Rect | null = null;
  if (rectRaw) {
    const parts = rectRaw.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0) || parts[2] < 1 || parts[3] < 1 || parts[2] > 1 << 15 || parts[3] > 1 << 15) return null;
    rect = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }
  const policy = q.get('policy') === 'effective' ? 'effective' : 'raw';
  return { mode: mode as Exclude<VisualDiffMode, 'pair'>, side, rect, regionIds: (q.get('regions') ?? '').split(',').filter(Boolean), policy, showIgnored: q.get('ignored') !== '0', revision: q.get('rev') };
}

export { CROP_MAX_SIDE, DEFAULT_CONTEXT_PADDING };
