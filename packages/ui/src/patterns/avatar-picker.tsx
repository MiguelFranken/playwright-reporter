'use client';

import { ImageUp, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '../components/button';
import { ProfileAvatar } from './profile-avatar';

export interface AvatarPickerProps {
  name: string;
  /** The current image, already vetted by the host; `null` shows the initials. */
  image: string | null;
  shape?: 'circle' | 'square';
  /** MIME types the file picker offers. */
  accept?: readonly string[];
  /** An upload or removal is in flight: both buttons disable and the primary one says so. */
  pending?: boolean;
  /** Called with the picked file. Cropping, scaling and uploading are the host's job. */
  onFileSelect: (file: File) => void;
  onRemove: () => void;
}

/**
 * The current profile image with Upload/Replace and Remove. It only picks the
 * file: the app crops it in the browser and sends it to a server action.
 */
export function AvatarPicker({
  name,
  image,
  shape,
  accept = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  pending = false,
  onFileSelect,
  onRemove,
}: AvatarPickerProps) {
  const input = useRef<HTMLInputElement>(null);

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
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onRemove}>
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
        accept={accept.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // picking the same file again should fire again
          if (file) onFileSelect(file);
        }}
      />
    </div>
  );
}
