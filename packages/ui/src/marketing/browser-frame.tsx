import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { Frame } from '../lib/marketing';

/**
 * Chrome around a screenshot or a live demo. The frame is what tells a visitor
 * "this is the actual product", so it is worth the three traffic lights and a
 * URL bar — but it is optional, because a cropped detail shot reads better
 * without a window around it.
 */
export function BrowserFrame({
  url,
  frame = 'browser',
  caption,
  className,
  children,
}: {
  url?: string;
  frame?: Frame;
  caption?: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (frame === 'none') return <>{children}</>;

  const body = (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-surface shadow-e3',
        className,
      )}
    >
      {frame === 'browser' ? (
        <div className="flex items-center gap-2 border-b border-separator bg-surface-sunken px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-neutral-border" />
            <span className="size-2.5 rounded-full bg-neutral-border" />
            <span className="size-2.5 rounded-full bg-neutral-border" />
          </span>
          {url ? (
            <span className="mx-auto max-w-[60%] truncate rounded-md bg-background px-2.5 py-0.5 text-code-xs text-muted-foreground">
              {url}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="bg-background">{children}</div>
    </div>
  );

  if (!caption) return body;
  return (
    <figure className="flex flex-col gap-3">
      {body}
      <figcaption className="text-body-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
