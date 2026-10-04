import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** The edge a floating bar is docked to, standing upright along it; `null` while it floats on its side. */
export type FloatingDock = 'left' | 'right' | null;

/**
 * Where a floating bar has been put, by its middle, as fractions of its
 * bounds — so a smaller window still finds it in the same part of the screen.
 * Docked, only the height counts: the edge decides the rest.
 */
export interface FloatingPlacement {
  dock: FloatingDock;
  x: number;
  y: number;
}

/** How close to the edge of its bounds the bar may be moved. */
const MARGIN = 8;
/** The pointer this close to a side edge docks the bar there; this far out again undocks it — apart, so it cannot flicker. */
const DOCK_IN = 56;
const DOCK_OUT = 88;
/** How far an arrow key moves it, and with Shift held. */
const STEP = { key: 16, shift: 64 } as const;
/** How long the bar glides after a key, a dock or a jump home: the length of its ease. */
const GLIDE_MS = 320;
/** A press on the grip that moves less than this is a click, not a drag. */
const SLOP = 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function read(key: string | undefined): FloatingPlacement | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FloatingPlacement> & { v?: number };
    // Version 1 kept an offset in pixels; it is forgotten rather than misread.
    if (v.v !== 2 || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
    const dock = v.dock === 'left' || v.dock === 'right' ? v.dock : null;
    return { dock, x: clamp01(v.x as number), y: clamp01(v.y as number) };
  } catch {
    return null;
  }
}

function write(key: string | undefined, v: FloatingPlacement | null) {
  if (!key) return;
  try {
    if (!v) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ v: 2, dock: v.dock, x: Number(v.x.toFixed(4)), y: Number(v.y.toFixed(4)) }));
  } catch {
    // Storage can be blocked or full: the bar still moves, it is only not remembered.
  }
}

/** The part of the bounds that can be seen: a tall section scrolled half away only offers its visible half. */
function boundsOf(el: HTMLElement): DOMRect {
  const view = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const b = el.closest<HTMLElement>('[data-float-bounds]')?.getBoundingClientRect();
  if (!b) return view;
  const left = Math.max(b.left, view.left);
  const top = Math.max(b.top, view.top);
  const right = Math.min(b.right, view.right);
  const bottom = Math.min(b.bottom, view.bottom);
  return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : view;
}

/** Where the layout puts the element, from offsets: a bounding rect would include the translate, mid-ease while it glides. */
function naturalOf(el: HTMLElement): DOMRect {
  const parent = el.offsetParent as HTMLElement | null;
  const p = parent?.getBoundingClientRect() ?? new DOMRect();
  return new DOMRect(p.left + (parent?.clientLeft ?? 0) + el.offsetLeft, p.top + (parent?.clientTop ?? 0) + el.offsetTop, el.offsetWidth, el.offsetHeight);
}

/** `value` kept within `[lo, hi]`; the middle of the two when they cross (bounds smaller than the bar). */
const within = (value: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, value)));

/**
 * The place of a bar floating over a canvas, the way a design tool's is: it
 * starts where the layout puts it, its grip drags it anywhere inside the
 * closest ancestor marked `data-float-bounds` (or the window), and brought to
 * the left or right edge it docks there, standing upright — when it fits
 * upright. The arrow keys on the grip move it (and dock it against an edge,
 * or pull it off one); Home or a double-click sends it back. With a
 * `storageKey` the browser remembers where it was left.
 *
 * It keeps its middle where it was put while its size changes, so it grows
 * the same way to both sides; while dragged, the grip stays under the pointer
 * however the bar changes shape around it.
 *
 * `ref` goes on the bar, which must be `position: relative` so the grip's
 * offsets are its own; `gripRef` on the grip, and `handleProps` too. The bar
 * is moved with the CSS `translate`, written straight to it, and marked
 * `data-dragging` while dragged and `data-gliding` while it eases somewhere —
 * for its styles to answer. None of that renders anything: in a drag, only
 * docking and undocking do.
 */
export function useFloatingPlacement<T extends HTMLElement, G extends HTMLElement>({
  storageKey,
  onBeforeDockChange,
}: {
  storageKey?: string;
  /** Called just before the bar turns upright or back, while the old layout can still be measured. */
  onBeforeDockChange?: () => void;
} = {}) {
  const ref = useRef<T>(null);
  const gripRef = useRef<G>(null);
  const [dock, setDockState] = useState<FloatingDock>(null);
  // Being dragged, and gliding (moved by a key or sent home: it eases to its new place instead of being written
  // there), are marks on the bar — `data-dragging`, `data-gliding` — not state: they change while the pointer moves,
  // and a render of the bar for each would cost more than the move itself.
  const glideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const placement = useRef<FloatingPlacement | null>(null);
  const dockRef = useRef<FloatingDock>(null);
  const centre = useRef<{ x: number; y: number } | null>(null);
  // `canDock`: a drag that starts at an edge must leave it before it can dock there, or a bar resting against the
  // edge would stand up the moment it is picked up.
  const drag = useRef<{ id: number; grabX: number; grabY: number; px: number; py: number; startX: number; startY: number; moved: boolean; canDock: boolean } | null>(null);
  const before = useRef(onBeforeDockChange);
  useLayoutEffect(() => {
    before.current = onBeforeDockChange;
  });

  const glide = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.gliding = '';
    clearTimeout(glideTimer.current);
    glideTimer.current = setTimeout(() => delete el.dataset.gliding, GLIDE_MS);
  }, []);
  useEffect(() => () => clearTimeout(glideTimer.current), []);

  const setDock = useCallback((next: FloatingDock) => {
    if (dockRef.current === next) return;
    before.current?.();
    dockRef.current = next;
    setDockState(next);
  }, []);

  /** Whether the bar fits upright: its length lying down, against the height it would stand in. */
  const fitsUpright = useCallback((el: HTMLElement, box: DOMRect) => {
    const length = dockRef.current ? el.scrollHeight : el.scrollWidth;
    return length <= box.height - 2 * MARGIN;
  }, []);

  /** Puts the bar where it belongs now: under the pointer, at its placement, or where the layout has it. */
  const layout = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const box = boundsOf(el);
    // Grown too tall to stand along the edge (the colours opened, the window shrank): it lies down where it is.
    if (dockRef.current && !drag.current && !fitsUpright(el, box)) {
      const c = centre.current;
      placement.current = { dock: null, x: c ? clamp01((c.x - box.left) / box.width) : 0.5, y: c ? clamp01((c.y - box.top) / box.height) : 1 };
      setDock(null);
      return;
    }
    const n = naturalOf(el);
    const d = drag.current;
    const p = placement.current;
    let cx: number;
    let cy: number;
    if (d) {
      const grip = gripRef.current;
      const gx = grip ? grip.offsetLeft + grip.offsetWidth / 2 : 0;
      const gy = grip ? grip.offsetTop + grip.offsetHeight / 2 : n.height / 2;
      cx = d.px - d.grabX - gx + n.width / 2;
      cy = d.py - d.grabY - gy + n.height / 2;
    } else if (p) {
      cx = box.left + p.x * box.width;
      cy = box.top + p.y * box.height;
    } else {
      el.style.translate = '';
      centre.current = { x: n.left + n.width / 2, y: n.top + n.height / 2 };
      return;
    }
    const half = { w: n.width / 2, h: n.height / 2 };
    const lo = { x: box.left + MARGIN + half.w, y: box.top + MARGIN + half.h };
    const hi = { x: box.right - MARGIN - half.w, y: box.bottom - MARGIN - half.h };
    cx = dockRef.current === 'left' ? lo.x : dockRef.current === 'right' ? hi.x : within(cx, lo.x, hi.x);
    cy = within(cy, lo.y, hi.y);
    centre.current = { x: cx, y: cy };
    el.style.translate = `${cx - half.w - n.left}px ${cy - half.h - n.top}px`;
  }, [fitsUpright, setDock]);

  /** Keeps where the bar is now as its placement, and remembers it. */
  const settle = useCallback(() => {
    const el = ref.current;
    const c = centre.current;
    if (!el || !c) return;
    const box = boundsOf(el);
    placement.current = { dock: dockRef.current, x: clamp01((c.x - box.left) / box.width), y: clamp01((c.y - box.top) / box.height) };
    write(storageKey, placement.current);
  }, [storageKey]);

  // Where it was left last time; read after mount, since the server has no storage. It is put there, not glided.
  useLayoutEffect(() => {
    const stored = read(storageKey);
    if (!stored) return;
    placement.current = stored;
    dockRef.current = stored.dock;
    setDockState(stored.dock);
    layout();
  }, [storageKey, layout]);

  // Every render can change the bar's shape (upright or not, folded or not): put it in place again before paint.
  useLayoutEffect(() => {
    layout();
  });

  // …and so can its own size easing, its bounds or the window changing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bounds = el.closest<HTMLElement>('[data-float-bounds]');
    const observer = new ResizeObserver(layout);
    observer.observe(el);
    if (bounds) observer.observe(bounds);
    window.addEventListener('resize', layout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', layout);
    };
  }, [layout]);

  // The listeners of a drag in progress, taken off when it ends (or the bar goes away mid-drag).
  const detach = useRef<(() => void) | null>(null);
  useEffect(() => () => detach.current?.(), []);

  /** One pointer event of a drag: the bar under the pointer, docked or not by where it is. */
  const dragTo = (e: PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || d.id !== e.pointerId || !el) return;
    // The pointer is the grip's until it is let go: nothing above needs to hear it move, React's root included.
    e.stopPropagation();
    d.px = e.clientX;
    d.py = e.clientY;
    if (!d.moved) {
      if (Math.abs(d.px - d.startX) + Math.abs(d.py - d.startY) < SLOP) return;
      d.moved = true;
      el.dataset.dragging = '';
    }
    const box = boundsOf(el);
    const current = dockRef.current;
    let next = current;
    const nearLeft = d.px - box.left < DOCK_IN;
    const nearRight = box.right - d.px < DOCK_IN;
    if (!nearLeft && !nearRight) d.canDock = true;
    if (!current && d.canDock) {
      if (nearLeft && fitsUpright(el, box)) next = 'left';
      else if (nearRight && fitsUpright(el, box)) next = 'right';
    } else if ((current === 'left' && d.px - box.left > DOCK_OUT) || (current === 'right' && box.right - d.px > DOCK_OUT)) {
      next = null;
    }
    // Into the edge or out of it, the bar stays under the pointer: easing it there would leave it trailing behind.
    if (next !== current) setDock(next);
    layout();
  };

  const endDrag = (e: PointerEvent) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    detach.current?.();
    drag.current = null;
    if (ref.current) delete ref.current.dataset.dragging;
    if (d.moved) settle();
    layout();
  };

  const handleProps = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      const grip = gripRef.current;
      if (!grip) return;
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const g = grip.getBoundingClientRect();
      const box = ref.current ? boundsOf(ref.current) : null;
      const inZone = !!box && (e.clientX - box.left < DOCK_IN || box.right - e.clientX < DOCK_IN);
      drag.current = {
        id: e.pointerId,
        grabX: e.clientX - (g.left + g.width / 2),
        grabY: e.clientY - (g.top + g.height / 2),
        px: e.clientX,
        py: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        canDock: !inZone,
      };
      // Native listeners, for the drag only: a move then goes straight to the bar, not through React's events.
      detach.current?.();
      target.addEventListener('pointermove', dragTo);
      target.addEventListener('pointerup', endDrag);
      target.addEventListener('pointercancel', endDrag);
      detach.current = () => {
        target.removeEventListener('pointermove', dragTo);
        target.removeEventListener('pointerup', endDrag);
        target.removeEventListener('pointercancel', endDrag);
        detach.current = null;
      };
    },
    onDoubleClick() {
      placement.current = null;
      glide();
      setDock(null);
      write(storageKey, null);
      layout();
    },
    onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
      const el = ref.current;
      const c = centre.current;
      if (!el || !c) return;
      const step = e.shiftKey ? STEP.shift : STEP.key;
      const box = boundsOf(el);
      const n = naturalOf(el);
      const current = dockRef.current;
      let x = c.x;
      let y = c.y;
      let next = current;
      if (e.key === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        placement.current = null;
        glide();
        setDock(null);
        write(storageKey, null);
        layout();
        return;
      }
      if (e.key === 'ArrowUp') y -= step;
      else if (e.key === 'ArrowDown') y += step;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const towards = e.key === 'ArrowLeft' ? 'left' : 'right';
        if (current && current !== towards) {
          // Off the edge it stood along: lying down again, just clear of it.
          next = null;
          x = towards === 'right' ? box.left + MARGIN + step : box.right - MARGIN - step;
        } else if (!current) {
          const atEdge = towards === 'left' ? c.x - n.width / 2 <= box.left + MARGIN + 0.5 : c.x + n.width / 2 >= box.right - MARGIN - 0.5;
          if (atEdge && fitsUpright(el, box)) next = towards;
          else x += towards === 'left' ? -step : step;
        }
      } else return;
      // The arrows are the viewer's too (next checkpoint): on the grip they move the bar only.
      e.preventDefault();
      e.stopPropagation();
      placement.current = { dock: next, x: clamp01((x - box.left) / box.width), y: clamp01((y - box.top) / box.height) };
      glide();
      setDock(next);
      layout();
      settle();
    },
  };

  return { ref, gripRef, dock, handleProps };
}
