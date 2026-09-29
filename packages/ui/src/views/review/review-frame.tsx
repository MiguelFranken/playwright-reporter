import { Clock, ImageOff, Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ReviewImage } from '../../lib/review';

const REASONS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: 'Uploading', icon: Loader2 },
  expired: { label: 'Deleted by retention', icon: Clock },
  failed: { label: 'Upload failed', icon: ImageOff },
};

/** What stands in for an image that cannot be shown, and why. */
export function UnavailableImage({ image, className }: { image: ReviewImage; className?: string }) {
  const reason = REASONS[image.unavailableReason ?? ''] ?? { label: 'Not available', icon: ImageOff };
  const Icon = reason.icon;
  return (
    <div className={cn('flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface-sunken p-3 text-center text-xs text-muted-foreground', className)}>
      <Icon className={cn('size-4', image.unavailableReason === 'pending' && 'animate-spin')} />
      {reason.label}
    </div>
  );
}

/**
 * A preview of a capture at the shape of the viewport it was taken in, so a
 * desktop and a mobile frame read as what they are before anyone looks
 * closely. The preview shows the top of the page; a full-page image is taller.
 */
export function ReviewFrame({
  image,
  viewport,
  alt,
  height = 176,
  className,
}: {
  image: ReviewImage;
  viewport?: { width: number; height: number } | null;
  alt: string;
  /** In pixels: frames in a strip share a height and differ in width. */
  height?: number;
  className?: string;
}) {
  const ratio = viewport ? viewport.width / viewport.height : 16 / 10;
  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-md border border-border bg-surface shadow-e1', className)}
      style={{ height, width: Math.round(height * ratio) }}
    >
      {image.available ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.thumbnailUrl ?? image.url} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
      ) : (
        <UnavailableImage image={image} />
      )}
    </div>
  );
}
