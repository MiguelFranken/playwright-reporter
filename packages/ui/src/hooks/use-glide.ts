import { useEffect, useLayoutEffect, useRef } from 'react';

/** How fast a glide catches up with its target, as the time constant of an exponential ease (the same at any frame rate). */
export const GLIDE_MS = { drag: 40, jump: 90 } as const;

/**
 * A number that eases toward where it is sent, one `requestAnimationFrame`
 * loop at a time, and hands every frame's value to `onFrame` — which writes it
 * straight to the DOM (a CSS variable), so a drag moves things without React
 * rendering anything. Uneven pointer events still move smoothly; a click or a
 * key glides instead of jumping. `onRest` runs once the value arrives, which
 * is when it is within `epsilon` of the target: below what anyone can see.
 */
export function useGlide(initial: number, { onFrame, onRest, epsilon }: { onFrame: (x: number) => void; onRest?: (x: number) => void; epsilon: number }) {
  const m = useRef({ x: initial, target: initial, ease: GLIDE_MS.drag as number, frame: 0, last: 0 });
  const callbacks = useRef({ onFrame, onRest, epsilon });
  useLayoutEffect(() => {
    callbacks.current = { onFrame, onRest, epsilon };
  });
  useEffect(() => () => cancelAnimationFrame(m.current.frame), []);

  const api = useRef({
    /** Eases toward `v`; `ease` is the time constant, in ms. */
    to(v: number, ease: number = GLIDE_MS.drag) {
      const s = m.current;
      s.target = v;
      s.ease = ease;
      if (!s.frame) s.frame = requestAnimationFrame(tick);
    },
    /** Puts the value at `v` at once, without a frame. */
    place(v: number) {
      const s = m.current;
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.last = 0;
      s.x = s.target = v;
    },
    /** Whether a frame is on its way. */
    moving: () => m.current.frame !== 0,
    /** Where the value is heading. */
    target: () => m.current.target,
  }).current;

  function tick(now: number) {
    const s = m.current;
    const dt = s.last ? Math.min(now - s.last, 64) : 16;
    s.last = now;
    s.x += (s.target - s.x) * (1 - Math.exp(-dt / s.ease));
    if (Math.abs(s.target - s.x) < callbacks.current.epsilon) s.x = s.target;
    callbacks.current.onFrame(s.x);
    if (s.x !== s.target) s.frame = requestAnimationFrame(tick);
    else {
      s.frame = 0;
      s.last = 0;
      callbacks.current.onRest?.(s.x);
    }
  }

  return api;
}
