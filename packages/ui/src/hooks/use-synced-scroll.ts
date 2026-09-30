import { useEffect } from 'react';

/**
 * Scrolls the elements matching `selector` inside `container` together: when
 * one scrolls, the others take the same offset on the next animation frame.
 * Offsets are copied as they are, in pixels, so two screens shown at the same
 * zoom keep the same part of the page side by side even when one page is
 * longer. The scroll the copy causes is recognised and not copied back.
 */
export function useSyncedScroll(container: HTMLElement | null, selector: string, enabled: boolean) {
  useEffect(() => {
    if (!container || !enabled) return;
    const els = [...container.querySelectorAll<HTMLElement>(selector)];
    if (els.length < 2) return;
    // What each element was last set to by this hook: its own scroll event to there is an echo.
    const set = new Map<HTMLElement, { top: number; left: number }>();
    let frame = 0;
    let source: HTMLElement | null = null;
    const copy = () => {
      frame = 0;
      if (!source) return;
      const { scrollTop: top, scrollLeft: left } = source;
      for (const el of els) {
        if (el === source) continue;
        const max = { top: el.scrollHeight - el.clientHeight, left: el.scrollWidth - el.clientWidth };
        const next = { top: Math.min(top, Math.max(0, max.top)), left: Math.min(left, Math.max(0, max.left)) };
        if (Math.abs(el.scrollTop - next.top) < 1 && Math.abs(el.scrollLeft - next.left) < 1) continue;
        set.set(el, next);
        el.scrollTop = next.top;
        el.scrollLeft = next.left;
      }
    };
    const onScroll = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      const echo = set.get(el);
      if (echo && Math.abs(el.scrollTop - echo.top) < 1 && Math.abs(el.scrollLeft - echo.left) < 1) {
        set.delete(el);
        return;
      }
      set.delete(el);
      source = el;
      if (!frame) frame = requestAnimationFrame(copy);
    };
    for (const el of els) el.addEventListener('scroll', onScroll, { passive: true });
    // Turned on while apart: line the others up with the first.
    source = els[0];
    copy();
    return () => {
      cancelAnimationFrame(frame);
      for (const el of els) el.removeEventListener('scroll', onScroll);
    };
  }, [container, selector, enabled]);
}
