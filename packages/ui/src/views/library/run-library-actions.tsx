'use client';

import { BookImage, Pin } from 'lucide-react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Link } from '../../provider';
import { libraryRefShort, type LibraryReferenceView } from '../../lib/library';

/**
 * A run's way into the library, beside its review: open its branch or pull
 * request there, or pin this very run as the version the library shows — the
 * approved state of a release, say — so later runs do not replace it.
 */
export function RunLibraryActions({
  reference,
  runNumber,
  libraryHref,
  onPin,
  pending = false,
}: {
  /** The run's pull request (or branch) as the library knows it. */
  reference: LibraryReferenceView;
  runNumber: number;
  libraryHref: string;
  /** Pins this run; absent for readers who may not change the library. */
  onPin?: () => void;
  pending?: boolean;
}) {
  const pinned = reference.pinnedRun?.number === runNumber;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pinned ? (
        <Badge variant="secondary" className="gap-1">
          <Pin className="size-3" /> Pinned in the library
        </Badge>
      ) : onPin ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={onPin} title={`Show run #${runNumber} for ${libraryRefShort(reference.key)} in the library, whatever runs next`}>
          <Pin /> {pending ? 'Pinning…' : 'Pin to library'}
        </Button>
      ) : null}
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={libraryHref} />}>
        <BookImage /> Open in library
      </Button>
    </div>
  );
}
