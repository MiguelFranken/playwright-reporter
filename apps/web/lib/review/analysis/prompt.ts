/**
 * What the model is asked and what it may answer. One bounded call: the
 * regions of a comparison as readable base/head crops, a schema that makes
 * it name a region id, separate what it sees from what it suspects, and
 * propose at most a few tight rectangles — which are then checked against
 * the region on this side, because a valid JSON answer is not a safe one.
 *
 * Coordinates the model gives are normalised to the crop it was shown
 * (0–1000 on each axis, like Gemini's bounding boxes), never image pixels:
 * a model cannot know the image's size, and a crop is what it looked at.
 */
import { z } from 'zod';
import { ANALYSIS_HYPOTHESES, ANALYSIS_RECOMMENDATIONS, intersection, type Rect, type VisualDiffRegion } from '@miguelfranken/ui/lib/visual-diff';

export const PROMPT_VERSION = 'visual-diff-explain/1';
export const SCHEMA_VERSION = 'visual-diff-suggestions/1';

/** Regions per analysis and crops per region: what keeps a call bounded and its cost known. */
export const MAX_REGIONS_PER_ANALYSIS = 4;
export const MAX_CROPS_PER_ANALYSIS = 8;
export const MAX_OUTPUT_TOKENS = 1_500;
/** Tokens the text of the prompt costs at most, for the reservation. */
export const PROMPT_TEXT_TOKENS = 1_200;

const box = z.object({
  x0: z.number().min(0).max(1000),
  y0: z.number().min(0).max(1000),
  x1: z.number().min(0).max(1000),
  y1: z.number().min(0).max(1000),
});

export const regionAnswer = z.object({
  regionId: z.string().describe('The id of the region, exactly as given.'),
  observation: z.string().max(400).describe('What differs between base and head, in one or two sentences. No cause.'),
  hypothesis: z.enum(ANALYSIS_HYPOTHESES).describe('The most likely kind of difference.'),
  alternatives: z.array(z.string().max(200)).max(3).describe('Other explanations that fit what is visible.'),
  recommendation: z.enum(ANALYSIS_RECOMMENDATIONS),
  uncertainty: z.enum(['low', 'medium', 'high']).describe('How sure the observation supports the hypothesis. Two images rarely prove randomness: say so.'),
  dynamicBoxes: z
    .array(box)
    .max(3)
    .describe('Only when recommendation is consider_ignore: tight boxes around the text or element that changes, in thousandths of the HEAD crop shown for this region (x right, y down). Never include a price, total, button or error next to it.'),
});

export const analysisAnswer = z.object({
  summary: z.string().max(600).describe('Two sentences at most: what kind of differences these are, overall.'),
  regions: z.array(regionAnswer).max(MAX_REGIONS_PER_ANALYSIS),
});

export type AnalysisAnswer = z.infer<typeof analysisAnswer>;

export const SYSTEM_PROMPT = `You compare two screenshots of the same screen of a web application taken by an automated test in two runs: BASE (earlier) and HEAD (later). You are shown the changed regions one by one as crops of both images, labelled D1, D2… with a stable region id.

For each region, describe what differs (observation) and what kind of difference it most likely is (hypothesis): dynamic_text (a generated name, an id, a counter), time_dependent (a date, a clock, a countdown), image_content (a photo or avatar changed), layout_shift (content moved or wrapped), rendering_noise (anti-aliasing, fonts, sub-pixel differences), real_change (the UI itself changed: a label, a colour, a missing control, a new error), or unknown.

Keep observation and hypothesis apart. Two images cannot prove that a text is random; say how sure you are and what would prove it. Prices, totals, permissions, validation and error messages, missing controls and layout or size changes are never candidates for leaving out: recommend stabilising the test or investigating instead.

Propose dynamicBoxes only when a region is clearly dynamic text or a time-dependent value and nothing else sits inside the box. Boxes are tight: the text that changes, not the row, card or table it is in. If you cannot draw a tight box, propose none.`;

/** The text beside the crops of one region. */
export function regionText(region: VisualDiffRegion, crop: { base: Rect | null; head: Rect | null }, captureScale: number | null): string {
  const rect = region.headRect ?? region.baseRect!;
  const px = `${rect.width}×${rect.height} px at ${rect.x},${rect.y}`;
  return [
    `Region ${region.label} (id ${region.id}): ${region.kind === 'removed-area' ? 'area only the base image has' : region.kind === 'added-area' ? 'area only the head image has' : 'changed pixels'}, ${px}${captureScale && captureScale !== 1 ? ` (device scale ${captureScale}×)` : ''}, ${region.rawChangedPixels.toLocaleString('en')} changed pixels.`,
    crop.base ? `The BASE crop shows ${crop.base.width}×${crop.base.height} px at ${crop.base.x},${crop.base.y} of the base image.` : 'No base crop: the base image does not cover this area.',
    crop.head ? `The HEAD crop shows ${crop.head.width}×${crop.head.height} px at ${crop.head.x},${crop.head.y} of the head image. Boxes you propose are in thousandths of this crop.` : 'No head crop: the head image does not cover this area.',
  ].join(' ');
}

export interface Context {
  test: string;
  file: string;
  checkpoint: string;
  stepPath: string[];
  url: string | null;
  baseRun: number | null;
  headRun: number | null;
}

export function introText(ctx: Context, regions: number): string {
  return `Screen "${ctx.checkpoint}" of test "${ctx.test}" (${ctx.file})${ctx.stepPath.length ? `, step ${ctx.stepPath.join(' › ')}` : ''}${ctx.url ? `, page ${ctx.url}` : ''}. BASE is run #${ctx.baseRun ?? '?'}, HEAD is run #${ctx.headRun ?? '?'}. ${regions} region${regions === 1 ? '' : 's'} follow${regions === 1 ? 's' : ''}; answer for each by its id.`;
}

/** A box in thousandths of a crop, as image pixels within that crop. */
export function boxToRect(b: z.infer<typeof box>, crop: Rect): Rect | null {
  const x0 = Math.min(b.x0, b.x1);
  const x1 = Math.max(b.x0, b.x1);
  const y0 = Math.min(b.y0, b.y1);
  const y1 = Math.max(b.y0, b.y1);
  const rect = {
    x: crop.x + Math.floor((x0 / 1000) * crop.width),
    y: crop.y + Math.floor((y0 / 1000) * crop.height),
    width: Math.ceil(((x1 - x0) / 1000) * crop.width),
    height: Math.ceil(((y1 - y0) / 1000) * crop.height),
  };
  return rect.width >= 1 && rect.height >= 1 ? rect : null;
}

/** The most of the region's context a proposal may cover, as a share of the padded crop. */
export const MAX_BOX_SHARE_OF_CROP = 0.6;

/**
 * The rectangles a model proposed for a region, checked: inside the crop it
 * saw, overlapping the measured change, not most of the crop, and merged
 * where two overlap. What fails is dropped and named.
 */
export function validateBoxes(boxes: readonly z.infer<typeof box>[], crop: Rect, region: VisualDiffRegion): { rects: Rect[]; rejected: string[] } {
  const rects: Rect[] = [];
  const rejected: string[] = [];
  const change = region.headRect;
  for (const b of boxes) {
    const r = boxToRect(b, crop);
    if (!r) {
      rejected.push('an empty box');
      continue;
    }
    const inside = intersection(r, crop);
    if (!inside) {
      rejected.push('a box outside the crop');
      continue;
    }
    if (inside.width * inside.height > crop.width * crop.height * MAX_BOX_SHARE_OF_CROP) {
      rejected.push('a box covering most of the crop');
      continue;
    }
    if (change && !intersection(inside, change)) {
      rejected.push('a box that does not touch the change');
      continue;
    }
    rects.push(inside);
  }
  return { rects: mergeOverlapping(rects), rejected };
}

function mergeOverlapping(input: readonly Rect[]): Rect[] {
  const out: Rect[] = [];
  for (const r of input) {
    const hit = out.find((o) => intersection(o, r));
    if (!hit) {
      out.push({ ...r });
      continue;
    }
    const x1 = Math.max(hit.x + hit.width, r.x + r.width);
    const y1 = Math.max(hit.y + hit.height, r.y + r.height);
    hit.x = Math.min(hit.x, r.x);
    hit.y = Math.min(hit.y, r.y);
    hit.width = x1 - hit.x;
    hit.height = y1 - hit.y;
  }
  return out;
}
