import { useCallback, useEffect, useRef, useState } from 'react';

export interface FloatingOffset {
  x: number;
  y: number;
}

const HOME: FloatingOffset = { x: 0, y: 0 };
/** How close to the edge of its bounds a floating element may be moved. */
const MARGIN = 8;
/** How far an arrow key moves it, and with Shift held. */
const STEP = { key: 16, shift: 64 } as const;

function read(key: string | undefined): FloatingOffset | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FloatingOffset>;
    return Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x as number, y: v.y as number } : null;
  } catch {
    return null;
  }
}

function write(key: string | undefined, v: FloatingOffset) {
  if (!key) return;
  try {
    if (v.x === 0 && v.y === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ x: Math.round(v.x), y: Math.round(v.y) }));
  } catch {
    // Storage can be blocked or full: the element still moves, it is only not remembered.
  }
}

/**
 * Where a floating element (a tool bar over a canvas) has been moved to, as an
 * offset from the place the layout puts it: dragged by a handle, nudged with
 * the arrow keys, sent home with Home or a double-click. It stays inside the
 * closest ancestor marked `data-float-bounds` (or the window), also when it or
 * its bounds change size, and with a `storageKey` the browser remembers it.
 *
 * `ref` goes on the element that moves; `offset` is applied to it as a
 * transform, and `handleProps` go on the handle.
 */
export function useFloatingOffset<T extends HTMLElement>(storageKey?: string) {
  const ref = useRef<T>(null);
  const [offset, setOffset] = useState<FloatingOffset>(HOME);
  const [dragging, setDragging] = useState(false);
  // The offset last moved to, without waiting for a render.
  const applied = useRef(HOME);
  const drag = useRef<{ id: number; px: number; py: number; from: FloatingOffset } | null>(null);

  /** The nearest offset to `v` that keeps the element inside its bounds. */
  const clamp = useCallback((v: FloatingOffset): FloatingOffset => {
    const el = ref.current;
    if (!el) return v;
    const box = el.closest<HTMLElement>('[data-float-bounds]')?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    // Where the layout puts it, from offsets: a bounding rect would include the translate, mid-ease while it glides.
    const parent = el.offsetParent as HTMLElement | null;
    const p = parent?.getBoundingClientRect() ?? new DOMRect();
    const left = p.left + (parent?.clientLeft ?? 0) + el.offsetLeft;
    const top = p.top + (parent?.clientTop ?? 0) + el.offsetTop;
    const fit = (value: number, start: number, size: number, min: number, max: number) => {
      const lo = min + MARGIN - start;
      const hi = max - MARGIN - start - size;
      // Bounds smaller than the element: keep it where the layout put it.
      return lo > hi ? 0 : Math.min(hi, Math.max(lo, value));
    };
    return { x: fit(v.x, left, el.offsetWidth, box.left, box.right), y: fit(v.y, top, el.offsetHeight, box.top, box.bottom) };
  }, []);

  const moveTo = useCallback(
    (v: FloatingOffset) => {
      const next = clamp(v);
      applied.current = next;
      setOffset((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
      return next;
    },
    [clamp],
  );

  // Where it was left last time; read after mount, since the server has no storage.
  useEffect(() => {
    const stored = read(storageKey);
    if (stored) moveTo(stored);
  }, [storageKey, moveTo]);

  // Keep it inside when it grows (a bar unfolding) or its bounds shrink (a window, a side panel).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bounds = el.closest<HTMLElement>('[data-float-bounds]');
    const refit = () => {
      if (!drag.current) moveTo(applied.current);
    };
    const observer = new ResizeObserver(refit);
    observer.observe(el);
    if (bounds) observer.observe(bounds);
    window.addEventListener('resize', refit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', refit);
    };
  }, [moveTo]);

  const commit = (v: FloatingOffset) => write(storageKey, moveTo(v));

  const handleProps = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, from: applied.current };
      setDragging(true);
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      moveTo({ x: d.from.x + e.clientX - d.px, y: d.from.y + e.clientY - d.py });
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      if (drag.current?.id !== e.pointerId) return;
      drag.current = null;
      setDragging(false);
      commit(applied.current);
    },
    onPointerCancel(e: React.PointerEvent<HTMLElement>) {
      if (drag.current?.id !== e.pointerId) return;
      drag.current = null;
      setDragging(false);
      commit(applied.current);
    },
    onDoubleClick() {
      commit(HOME);
    },
    onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
      const step = e.shiftKey ? STEP.shift : STEP.key;
      const { x, y } = applied.current;
      const next =
        e.key === 'ArrowLeft' ? { x: x - step, y } : e.key === 'ArrowRight' ? { x: x + step, y } : e.key === 'ArrowUp' ? { x, y: y - step } : e.key === 'ArrowDown' ? { x, y: y + step } : e.key === 'Home' ? HOME : null;
      if (!next) return;
      // The arrows are the viewer's too (next checkpoint): on the handle they move the bar only.
      e.preventDefault();
      e.stopPropagation();
      commit(next);
    },
  };

  return { ref, offset, dragging, handleProps };
}
