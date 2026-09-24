import type { ImageSource, ThemedImageSources } from '@miguelfranken/ui/lib/marketing';
import type { Media } from '@/payload-types';

/** The CMS shape of a `themedMedia()` group. */
export interface CmsThemedMedia {
  light?: (number | null) | Media;
  dark?: (number | null) | Media;
}

function toImageSource(media: (number | null) | Media | undefined): ImageSource | null {
  // A number means the relationship was not populated at this depth.
  if (!media || typeof media === 'number' || !media.url) return null;
  return {
    src: media.url,
    width: media.width ?? undefined,
    height: media.height ?? undefined,
  };
}

/**
 * Turns an upload pair into what `ThemedImage` wants. Alt text comes from the
 * light image's media document, so it travels with the file rather than being
 * retyped into every block that uses it.
 */
export function resolveThemedMedia(
  group: CmsThemedMedia | null | undefined,
): ThemedImageSources | null {
  const light = toImageSource(group?.light);
  if (!light) return null;

  const lightDoc = group?.light;
  const alt = typeof lightDoc === 'object' && lightDoc ? lightDoc.alt : '';

  return { light, dark: toImageSource(group?.dark), alt: alt ?? '' };
}

/** A single upload, for the logo and the OG image. */
export function resolveMedia(media: (number | null) | Media | undefined): (ImageSource & { alt: string }) | null {
  const source = toImageSource(media);
  if (!source || typeof media !== 'object' || !media) return null;
  return { ...source, alt: media.alt ?? '' };
}
