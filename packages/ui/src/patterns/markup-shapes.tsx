import { useId } from 'react';
import { cn } from '../lib/cn';
import { isStroke, MARKUP_INK, strokePath, type MarkupColor, type MarkupShape } from '../lib/review-markup';

/** The pen's width on screen, in CSS pixels, at every zoom; a highlighter is wider. */
export const PEN_WIDTH = 3;
export const HIGHLIGHTER_WIDTH = 14;

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

/**
 * A drawing on a screenshot: pen and highlighter strokes, arrows, boxes and
 * ellipses in their colours, laid over the image it was drawn on and
 * stretched with it. Points are fractions of the image; lines keep their
 * width on screen whatever the zoom. A thin halo of the surface colour keeps
 * a line apart from the page under it, the way a pin's ring does.
 *
 * - `muted`: the thread is resolved; the drawing recedes.
 * - `dashed`: drawn on an earlier image that changed since.
 * - `emphasis`: its thread is open in a popover.
 */
export function MarkupShapes({
  shapes,
  muted = false,
  dashed = false,
  emphasis = false,
  className,
}: {
  shapes: readonly MarkupShape[];
  muted?: boolean;
  dashed?: boolean;
  emphasis?: boolean;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const colors = [...new Set(shapes.filter((s) => s.tool === 'arrow').map((s) => s.color))];
  const dash = dashed ? `${PEN_WIDTH * 2.5} ${PEN_WIDTH * 2}` : undefined;
  const width = emphasis ? PEN_WIDTH + 1 : PEN_WIDTH;
  return (
    <svg
      aria-hidden
      data-slot="markup-shapes"
      className={cn('pointer-events-none absolute inset-0 size-full overflow-visible transition-opacity duration-150', muted && 'opacity-45', className)}
    >
      <defs>
        {colors.map((c) => (
          <marker key={c} id={`${id}-head-${c}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M0 0L10 5L0 10Z" fill={MARKUP_INK[c]} stroke="var(--surface)" strokeWidth="1" strokeLinejoin="round" />
          </marker>
        ))}
      </defs>
      {/* Highlighters first: what is marked shows through them, and the lines stay on top. */}
      {[...shapes].sort((a, b) => Number(b.tool === 'highlighter') - Number(a.tool === 'highlighter')).map((shape, i) => (
        <Shape key={i} shape={shape} width={width} dash={dash} head={`${id}-head-${shape.color}`} />
      ))}
    </svg>
  );
}

function Shape({ shape, width, dash, head }: { shape: MarkupShape; width: number; dash?: string; head: string }) {
  const ink = MARKUP_INK[shape.color];
  if (isStroke(shape.tool)) {
    const highlighter = shape.tool === 'highlighter';
    const stroke = highlighter ? HIGHLIGHTER_WIDTH : width;
    if (shape.points.length === 2) {
      // A dot is drawn as a circle on the page's pixels: a zero-length path stretched with the image would come out
      // the wrong size, and jump when the stroke grows its second point.
      const at = { cx: pct(shape.points[0]), cy: pct(shape.points[1]) };
      return (
        <g>
          {highlighter ? null : <circle {...at} r={(width + 3) / 2} fill="var(--surface)" fillOpacity={0.85} />}
          <circle {...at} r={stroke / 2} fill={ink} fillOpacity={highlighter ? 0.38 : 1} />
        </g>
      );
    }
    const d = strokePath(shape.points);
    // Strokes are drawn in the image's fractions, stretched to its box; `non-scaling-stroke` keeps their width in CSS pixels.
    return (
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="overflow-visible" width="100%" height="100%">
        {highlighter ? null : <path d={d} fill="none" stroke="var(--surface)" strokeOpacity={0.85} strokeWidth={width + 3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        <path
          d={d}
          fill="none"
          stroke={ink}
          strokeOpacity={highlighter ? 0.38 : 1}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={highlighter ? undefined : dash}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }
  const [x1, y1, x2, y2] = shape.points;
  if (shape.tool === 'arrow') {
    const line = { x1: pct(x1), y1: pct(y1), x2: pct(x2), y2: pct(y2) };
    return (
      <g>
        <line {...line} stroke="var(--surface)" strokeOpacity={0.85} strokeWidth={width + 3} strokeLinecap="round" />
        <line {...line} stroke={ink} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} markerEnd={`url(#${head})`} />
      </g>
    );
  }
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  const halo = { fill: 'none', stroke: 'var(--surface)', strokeOpacity: 0.85, strokeWidth: width + 3 };
  const paint = { fill: 'none', stroke: ink, strokeWidth: width, strokeDasharray: dash };
  if (shape.tool === 'rect') {
    const geometry = { x: pct(x), y: pct(y), width: pct(w), height: pct(h), rx: 3 };
    return (
      <g>
        <rect {...geometry} {...halo} />
        <rect {...geometry} {...paint} />
      </g>
    );
  }
  const geometry = { cx: pct(x + w / 2), cy: pct(y + h / 2), rx: pct(w / 2), ry: pct(h / 2) };
  return (
    <g>
      <ellipse {...geometry} {...halo} />
      <ellipse {...geometry} {...paint} />
    </g>
  );
}

/** A colour's swatch: a dot of its ink, for a thread row or a legend. */
export function MarkupSwatch({ color, className }: { color: MarkupColor; className?: string }) {
  return <span aria-hidden data-slot="markup-swatch" className={cn('inline-block size-2.5 shrink-0 rounded-full ring-1 ring-foreground/15', className)} style={{ background: MARKUP_INK[color] }} />;
}
