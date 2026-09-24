'use client';

import { ImageUp, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@miguelfranken/ui/components/button';
import { ProfileAvatar } from '@/components/profile-avatar';
import { AVATAR_MAX_BYTES, AVATAR_SIZE, AVATAR_TYPES } from '@/lib/avatars';

type Result = { ok: true } | { ok: false; message: string };

/**
 * Picks an image, crops it to a centered square at `AVATAR_SIZE` in the
 * browser, and hands it to `upload`. Scaling here keeps the request small
 * whatever the camera produced, and the server still checks what it gets.
 */
export function AvatarUpload({
  name,
  image,
  shape,
  label,
  upload,
  remove,
}: {
  name: string;
  image: string | null;
  shape?: 'circle' | 'square';
  /** What the image belongs to, for the toasts: "Profile image", "Team image". */
  label: string;
  upload: (formData: FormData) => Promise<Result>;
  remove: () => Promise<Result>;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<Result>, success: string) =>
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(success);
      router.refresh();
    });

  const onFile = (file: File | undefined) => {
    if (input.current) input.current.value = ''; // picking the same file again should fire again
    if (!file) return;
    run(async () => {
      const blob = await toSquare(file).catch(() => null);
      if (!blob) return { ok: false, message: 'That file could not be read as an image.' };
      if (blob.size > AVATAR_MAX_BYTES) return { ok: false, message: 'That image is too large.' };
      const formData = new FormData();
      formData.set('file', blob, 'avatar');
      return upload(formData);
    }, `${label} updated.`);
  };

  return (
    <div className="flex items-center gap-4">
      <ProfileAvatar name={name} image={image} shape={shape} className="size-16" fallbackClassName="text-lg" />
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
            <ImageUp data-icon="inline-start" />
            {pending ? 'Saving…' : image ? 'Replace image' : 'Upload image'}
          </Button>
          {image ? (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(remove, `${label} removed.`)}>
              <Trash2 data-icon="inline-start" />
              Remove
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF. Cropped to a square.</p>
      </div>
      <input
        ref={input}
        type="file"
        accept={AVATAR_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  );
}

async function toSquare(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    // A browser that cannot encode WebP hands back a PNG, which is fine too.
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  } finally {
    bitmap.close();
  }
}
