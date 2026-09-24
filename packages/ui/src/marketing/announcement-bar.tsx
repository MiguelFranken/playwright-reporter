'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Link } from '../provider';

const STORAGE_PREFIX = 'announcement-dismissed:';

/**
 * The strip above the header. Dismissal is remembered per message text, so
 * changing the announcement brings it back for everyone who dismissed the last
 * one — which is the behaviour an editor expects.
 *
 * It renders on the server and hides itself after hydration rather than the
 * other way round: a bar that pops in a moment after load pushes the page down
 * under the reader.
 */
export function AnnouncementBar({
  text,
  href,
  linkLabel,
  dismissible = true,
}: {
  text: string;
  href?: string | null;
  linkLabel?: string | null;
  dismissible?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const key = `${STORAGE_PREFIX}${text}`;

  useEffect(() => {
    if (!dismissible) return;
    try {
      if (localStorage.getItem(key) === '1') setDismissed(true);
    } catch {
      // Private mode, or storage blocked entirely. The bar simply stays.
    }
  }, [dismissible, key]);

  if (dismissed) return null;

  return (
    <div className="relative border-b border-accent-border bg-accent-subtle text-accent-text">
      <div className="mx-auto flex w-full max-w-[72rem] items-center justify-center gap-3 px-10 py-2 text-body-xs md:px-8">
        <p className="text-center">{text}</p>
        {href ? (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline">
            {linkLabel ?? 'Read more'}
            <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
      {dismissible ? (
        <button
          type="button"
          aria-label="Dismiss announcement"
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 hover:bg-accent-border/40"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(key, '1');
            } catch {
              // Nothing to remember it with; it will be back next load.
            }
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
