'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { AvatarPicker } from '@miguelfranken/ui/patterns/avatar-picker';
import { AVATAR_MAX_BYTES, AVATAR_SIZE, AVATAR_TYPES, displayableAvatar } from '@/lib/avatars';

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

  const onFile = (file: File) =>
    run(async () => {
      const blob = await toSquare(file).catch(() => null);
      if (!blob) return { ok: false, message: 'That file could not be read as an image.' };
      if (blob.size > AVATAR_MAX_BYTES) return { ok: false, message: 'That image is too large.' };
      const formData = new FormData();
      formData.set('file', blob, 'avatar');
      return upload(formData);
    }, `${label} updated.`);

  return (
    <AvatarPicker
      name={name}
      image={displayableAvatar(image)}
      shape={shape}
      accept={AVATAR_TYPES}
      pending={pending}
      onFileSelect={onFile}
      onRemove={() => run(remove, `${label} removed.`)}
    />
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
