'use client';

import { ZoomIn, ZoomOut } from 'lucide-react';
import { useRef, useState } from 'react';
import { Slider } from '../../components/slider';
import { GLIDE_MS, useGlide } from '../../hooks/use-glide';

/** The overview's scale of a capture's real size: 10% (a strip of stamps) to 50% (readable, scrolling screens). */
export const STORYBOARD_SIZE = { min: 0.1, max: 0.5, key: 0.01, jump: 0.05, default: 0.18 } as const;

/** The pointer's precision: far below a pixel of the track, so the thumb follows the pointer instead of snapping to steps. */
const POINTER_STEP = 0.0001;
/** Arrow keys move by `key`, with Shift and Page Up/Down by `jump`. */
const KEY_STEPS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 };

const clampSize = (v: number) => Math.min(STORYBOARD_SIZE.max, Math.max(STORYBOARD_SIZE.min, v));

/**
 * The screen-size slider. The thumb follows the pointer continuously, and the
 * screens follow the value in one `requestAnimationFrame` loop (`useGlide`) that eases
 * toward it and writes it to their CSS variable (`onLive`), so uneven pointer
 * events still move them smoothly and a click, a key or a zoom button glides
 * instead of jumping. Nothing re-renders the rows until the motion settles
 * after the slider lets go; then `onCommit` renders them once at the new size.
 */
export function SizeControl({ size, onLive, onCommit }: { size: number; onLive: (v: number) => void; onCommit: (v: number) => void }) {
  // The thumb's value while the slider is in motion; the committed size at rest.
  const [thumb, setThumb] = useState<number | null>(null);
  const state = useRef({ dragging: false, commit: false });
  const shown = thumb ?? size;

  const settle = () => {
    const st = state.current;
    if (!st.commit || st.dragging || glide.moving()) return;
    st.commit = false;
    onCommit(+glide.target().toFixed(4));
    setThumb(null);
  };
  const glide = useGlide(size, {
    onFrame: (x) => {
      onLive(x);
      // Outside a drag the thumb glides with the screens.
      if (!state.current.dragging) setThumb(x);
    },
    onRest: settle,
    epsilon: 0.0002,
  });
  const moveTo = (v: number, ease: number) => {
    // From rest, start where the screens are: the committed size.
    if (!glide.moving() && thumb === null) glide.place(size);
    glide.to(clampSize(v), ease);
  };
  /** Moves by `by` from where the slider is heading, on the 1% grid, and commits there. */
  const step = (by: number) => {
    const from = glide.moving() || thumb !== null ? glide.target() : size;
    state.current.commit = true;
    moveTo(Math.round((from + by) / STORYBOARD_SIZE.key) * STORYBOARD_SIZE.key, GLIDE_MS.jump);
  };

  const icon = 'rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-40';
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2 py-1" title="Screen size">
      <button type="button" aria-label="Smaller screens" disabled={shown <= STORYBOARD_SIZE.min} onClick={() => step(-STORYBOARD_SIZE.jump)} className={icon}>
        <ZoomOut className="size-4" />
      </button>
      <Slider
        className="w-28"
        min={STORYBOARD_SIZE.min}
        max={STORYBOARD_SIZE.max}
        step={POINTER_STEP}
        value={shown}
        onValueChange={(v, details) => {
          const value = Array.isArray(v) ? v[0] : v;
          const st = state.current;
          st.dragging = details.reason === 'drag';
          if (st.dragging) setThumb(value);
          moveTo(value, st.dragging ? GLIDE_MS.drag : GLIDE_MS.jump);
        }}
        onValueCommitted={() => {
          const st = state.current;
          st.dragging = false;
          st.commit = true;
          settle();
        }}
        // With a pointer step this fine, the keys keep their own, coarser steps.
        onKeyDownCapture={(e) => {
          const n = KEY_STEPS[e.key];
          if (!n) return;
          e.preventDefault();
          e.stopPropagation();
          step(n * (e.shiftKey && Math.abs(n) === 1 ? STORYBOARD_SIZE.jump : STORYBOARD_SIZE.key));
        }}
        thumbLabel="Screen size"
        valueText={(v) => `${Math.round(v * 100)}% of the real size`}
      />
      <button type="button" aria-label="Larger screens" disabled={shown >= STORYBOARD_SIZE.max} onClick={() => step(STORYBOARD_SIZE.jump)} className={icon}>
        <ZoomIn className="size-4" />
      </button>
      <span className="w-9 text-right text-label-s text-muted-foreground tabular-nums">{Math.round(shown * 100)}%</span>
    </div>
  );
}
