'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TooltipProvider } from '../../components/tooltip';

/**
 * The frame every product demo is rendered into.
 *
 * The app's views lay themselves out against the *viewport*: a run card grid
 * goes two-up at `md`, a metric row goes four-up at `lg`. Inside a marketing
 * column a third of the viewport wide that produces squeezed, truncated
 * chrome — the opposite of the point, which is to show the real product.
 *
 * So a demo is rendered at a fixed desktop size and scaled down to whatever
 * width its column gives it. Every demo is then the same 16:10 window onto the
 * app, at the proportions it was designed for, and a showcase row stays
 * balanced however tall the view inside it would naturally be.
 */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 800;

/** What the server renders at. Corrected on mount, so hydration still matches. */
const INITIAL_SCALE = 0.5;

export function DemoShell({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(INITIAL_SCALE);

  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width > 0) setScale(width / DESIGN_WIDTH);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <TooltipProvider>
      <div
        ref={frame}
        // The box keeps the aspect ratio whatever the scale is, so the page
        // does not reflow when the observer corrects it after mount.
        className="w-full overflow-hidden"
        style={{ aspectRatio: `${DESIGN_WIDTH} / ${DESIGN_HEIGHT}` }}
      >
        {/* A demo is a picture of the product, not the product: every link
            inside it points at "#" and every control is wired to nothing.
            `inert` keeps the whole thing out of the tab order and out of the
            hit-testing that would otherwise offer a reader dozens of dead,
            sub-24px targets. */}
        <div
          inert
          className="origin-top-left p-6"
          style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Shared by the demos whose views take callbacks they are not meant to act on. */
export const noop = () => {};

/** The hrefs a demo hands its view. Every link in a demo goes nowhere. */
export const deadHrefs = {
  run: () => '#',
  test: () => '#',
  result: () => '#',
  outcome: () => '#',
  clearFilters: '#',
  errorGroup: () => '#',
  spec: () => '#',
};
