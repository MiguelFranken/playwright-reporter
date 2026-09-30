'use client';

import NextImage, { type ImageLoader } from 'next/image';
import { useState } from 'react';
import type { ImageProps } from '@miguelfranken/ui/provider';
import { imageVariantUrl, isArtifactImageUrl } from '@/lib/artifacts/image-variants';

/** Each width `next/image` offers, from the app's resizing route (`/api/artifacts/<id>/image?w=`). */
const artifactLoader: ImageLoader = ({ src, width }) => imageVariantUrl(src, width);

/**
 * The design system's images, through `next/image`: an artifact screenshot
 * gets a `srcset` of resized copies, so the browser loads the width it
 * shows (and a sharper one when the screens grow); anything else, and a copy
 * that fails, is the plain original.
 */
export function AppImage({ src, alt, width, height, sizes, className, style, loading = 'lazy', draggable, onLoad, onError, ref }: ImageProps) {
  const [original, setOriginal] = useState(false);
  const resizable = isArtifactImageUrl(src) && !original;
  return (
    <NextImage
      ref={ref}
      src={src}
      alt={alt}
      // Without a recorded size the browser learns it from the image; these only shape the placeholder.
      width={width ?? 1280}
      height={height ?? 720}
      sizes={sizes}
      loader={resizable ? artifactLoader : undefined}
      unoptimized={!resizable}
      loading={loading}
      draggable={draggable}
      className={className}
      style={style}
      onLoad={onLoad}
      onError={(e) => {
        if (resizable) setOriginal(true);
        else onError?.(e);
      }}
    />
  );
}
