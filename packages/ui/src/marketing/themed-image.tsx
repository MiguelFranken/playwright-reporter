import { cn } from '../lib/cn';
import type { ThemedImageSources } from '../lib/marketing';

/**
 * A light/dark screenshot pair, as two plain `<img>` elements swapped by the
 * `dark` class rather than by JavaScript — so the right one is already in the
 * HTML the server sent and nothing flashes on load.
 *
 * Deliberately not `next/image`: this package is host-agnostic. The website
 * passes dimensions from the CMS upload, which is what `next/image` would have
 * contributed anyway, and lazy loading is a plain attribute.
 */
export function ThemedImage({
  sources,
  sizes,
  priority = false,
  className,
}: {
  sources: ThemedImageSources;
  sizes?: string;
  /** The hero image is above the fold; everything else loads lazily. */
  priority?: boolean;
  className?: string;
}) {
  const { light, dark, alt } = sources;
  const common = {
    alt,
    sizes,
    loading: priority ? ('eager' as const) : ('lazy' as const),
    decoding: priority ? ('sync' as const) : ('async' as const),
  };
  return (
    <>
      <img
        {...common}
        src={light.src}
        width={light.width}
        height={light.height}
        className={cn('block h-auto w-full', dark && 'dark:hidden', className)}
      />
      {dark ? (
        <img
          {...common}
          // The hidden one must not be fetched in the theme that will not show it.
          aria-hidden
          src={dark.src}
          width={dark.width}
          height={dark.height}
          className={cn('hidden h-auto w-full dark:block', className)}
        />
      ) : null}
    </>
  );
}
