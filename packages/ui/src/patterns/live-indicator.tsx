import { cn } from '../lib/cn';

export type LiveState = 'connecting' | 'live' | 'polling' | 'done' | 'off';

const DOT: Record<Exclude<LiveState, 'off'>, string> = {
  live: 'bg-success-solid animate-pulse',
  polling: 'bg-warning-solid animate-pulse',
  done: 'bg-neutral-solid',
  connecting: 'bg-info-solid animate-pulse',
};

/**
 * The visible half of the app's live machinery (`LiveConnection`). The EventSource, the
 * polling fallback and `router.refresh()` all stay in the app; this renders the
 * state they arrive at, which is the part worth reviewing in a catalogue.
 */
export function LiveIndicator({
  state,
  label = 'Live',
  className,
}: {
  state: LiveState;
  label?: string;
  className?: string;
}) {
  if (state === 'off') return null;
  const text = state === 'live' ? label : state === 'polling' ? 'Polling' : state === 'done' ? 'Finished' : 'Connecting';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <span className={cn('size-2 rounded-full', DOT[state])} />
      {text}
    </span>
  );
}
