/**
 * Screenshots at the size they are shown. The storyboard draws hundreds of
 * screens a few hundred pixels wide; sending each one's full-page PNG costs
 * megabytes a screen. `next/image` asks for a width from `IMAGE_WIDTHS` (its
 * `srcset`, see `next.config.ts`), the image route resizes the original once
 * with sharp and keeps the copy next to it in the store, and every later
 * request for that width is a read.
 *
 * A width at or above the original's is not a copy: the original is lossless,
 * which is what a reviewer looking at pixels wants.
 */

/** The widths an image is offered in: `next.config.ts` builds its `srcset` from exactly these. */
export const DEVICE_WIDTHS = [640, 828, 1080, 1280, 1600, 1920, 2560, 3840] as const;
export const IMAGE_WIDTHS_SMALL = [96, 160, 256, 384, 480] as const;
export const IMAGE_WIDTHS: readonly number[] = [...IMAGE_WIDTHS_SMALL, ...DEVICE_WIDTHS];

export const VARIANT_QUALITY = 80;

/** The smallest offered width that is at least `width`, so any request maps onto a stored copy. */
export function snapWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return IMAGE_WIDTHS[0];
  return IMAGE_WIDTHS.find((w) => w >= width) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
}

/** Where the copy of an original `width` wide is stored: beside the original, so a prefix rule on the store covers both. */
export const variantKey = (storageKey: string, width: number) => `${storageKey}.w${width}.webp`;

/** Every copy an original can have: what deleting the original deletes too. */
export const variantKeys = (storageKey: string) => IMAGE_WIDTHS.map((w) => variantKey(storageKey, w));

/** Attachment kinds that are screenshots, and have copies. */
export const RESIZABLE_KINDS = new Set(['screenshot', 'image']);

/** One width of an artifact URL (`/api/artifacts/<id>`, signed or not): what the image loader hands `next/image`. */
export function imageVariantUrl(artifactUrl: string, width: number): string {
  const [path, query] = artifactUrl.split('?');
  const params = new URLSearchParams(query);
  params.set('w', String(snapWidth(width)));
  return `${path.replace(/\/$/, '')}/image?${params}`;
}

/** Whether a URL is an artifact this app can resize. */
export const isArtifactImageUrl = (url: string) => /^\/api\/artifacts\/[0-9a-f-]{36}(\?|$)/i.test(url);
