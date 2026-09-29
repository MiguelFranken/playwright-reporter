import { Check, Plus } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../lib/cn';

/**
 * - `open`: a thread waiting for someone.
 * - `outdated`: open, but placed on an earlier image that changed since (dashed).
 * - `resolved`: done (muted, a check instead of the number).
 * - `draft`: being written (breathes until it is posted).
 */
export type CommentPinState = 'open' | 'outdated' | 'resolved' | 'draft';

const STATE = {
  open: 'bg-accent-solid text-accent-on-solid',
  outdated: 'bg-surface text-accent-text outline-2 outline-dashed outline-accent-solid -outline-offset-2',
  resolved: 'bg-muted text-muted-foreground',
  draft: 'bg-accent-solid text-accent-on-solid animate-pin-breathe',
} as const satisfies Record<CommentPinState, string>;

/**
 * A numbered comment pin, Figma style: a speech bubble whose sharp corner is
 * the spot it points at — its bottom-left, so the host places that corner on
 * the point (`translate(0, -100%)`). A fixed size on screen at every zoom,
 * with a ring of the surface colour so it reads on any screenshot.
 *
 * A button: pass the thread's name as `aria-label`, and trigger props (a
 * popover's) through `render` or spread.
 */
export function CommentPin({
  number,
  state = 'open',
  selected = false,
  pending = false,
  ping = false,
  className,
  ...props
}: React.ComponentProps<'button'> & {
  /** The thread's number; a draft has none yet. */
  number?: number | null;
  state?: CommentPinState;
  /** Its thread is open in a popover or the list: larger, on top. */
  selected?: boolean;
  /** Being saved. */
  pending?: boolean;
  /** Ping once, to show where a list row's thread is. Change the element's `key` to ping again. */
  ping?: boolean;
}) {
  return (
    <button
      type="button"
      data-slot="comment-pin"
      data-state={state}
      data-selected={selected || undefined}
      className={cn(
        'inline-flex h-6 min-w-6 origin-bottom-left animate-pin-drop items-center justify-center rounded-full rounded-bl-[3px] px-1.5 text-label-xs tabular-nums shadow-e2 ring-2 ring-surface outline-none select-none',
        'cursor-pointer transition-[scale,box-shadow,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring',
        STATE[state],
        selected && 'scale-115 ring-accent-border',
        ping && 'animate-pin-ping',
        pending && 'opacity-70',
        className,
      )}
      {...props}
    >
      {state === 'resolved' ? <Check aria-hidden className="size-3" /> : number != null ? number : <Plus aria-hidden className="size-3.5" />}
    </button>
  );
}
