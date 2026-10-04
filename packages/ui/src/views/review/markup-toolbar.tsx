'use client';

import { Circle, Eraser, GripHorizontal, GripVertical, Highlighter, MessageSquarePlus, MoveUpRight, Pencil, Square, SquareDashedMousePointer, Undo2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/tooltip';
import { useFloatingPlacement } from '../../hooks/use-floating-placement';
import { cn } from '../../lib/cn';
import { COMMENT_TOOL_LABELS, COMMENT_TOOLS, isMarkupTool, MARKUP_COLOR_LABELS, MARKUP_COLORS, MARKUP_INK, type CommentTool, type MarkupColor } from '../../lib/review-markup';

const ICONS: Record<CommentTool, React.ComponentType<{ className?: string }>> = {
  pin: MessageSquarePlus,
  area: SquareDashedMousePointer,
  pen: Pencil,
  highlighter: Highlighter,
  arrow: MoveUpRight,
  rect: Square,
  ellipse: Circle,
  eraser: Eraser,
};

/** The key that picks each tool while commenting: its place in the bar. */
export const TOOL_KEYS: Record<CommentTool, string> = Object.fromEntries(COMMENT_TOOLS.map((t, i) => [t, String(i + 1)])) as Record<CommentTool, string>;

/** The tools that start a comment, and the ones that draw on the image (and erase it). */
const COMMENTING: readonly CommentTool[] = ['pin', 'area'];
const DRAWING: readonly CommentTool[] = COMMENT_TOOLS.filter((t) => !COMMENTING.includes(t));

export interface MarkupToolbarProps {
  tool: CommentTool;
  onToolChange: (next: CommentTool) => void;
  color: MarkupColor;
  onColorChange: (next: MarkupColor) => void;
  /** Something drawn or erased here can be taken back. */
  canUndo?: boolean;
  onUndo?: () => void;
  /** Leave comment mode. */
  onClose?: () => void;
  className?: string;
}

/**
 * The tools of comment mode, floating over the screenshot the way a design
 * tool's are: a pin and an area, which start a comment; five drawing tools —
 * pen, highlighter, arrow, rectangle, ellipse — and the eraser, which mark
 * up the image on their own; then the colour a drawing tool draws in (shown
 * only while one is picked), and undo. The keys 1–8 pick a tool. The colours
 * have names, so a comment can say "the blue box".
 */
export function MarkupToolbar({ className, ...props }: MarkupToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Comment tools"
      data-slot="markup-toolbar"
      className={cn('flex animate-rise-in items-center gap-1 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-e3', className)}
    >
      <MarkupTools {...props} />
    </div>
  );
}

type Orientation = 'horizontal' | 'vertical';
type TipSide = 'top' | 'left' | 'right';

/** A hairline between groups, across the bar's run. */
function Divider({ orientation }: { orientation: Orientation }) {
  return <span aria-hidden data-flip-fade className={cn('shrink-0 bg-border', orientation === 'vertical' ? 'my-1 h-px w-5' : 'mx-1 h-5 w-px')} />;
}

/**
 * What the bar holds; the colours slide open beside the tools while one draws,
 * and slide shut again. Upright, the same runs top to bottom. `data-flip`
 * names each control, so the bar can fly it from its old place to its new one.
 * Memoised: the bar renders as it docks or its tooltips switch, and the
 * seventeen tooltips in here only need to when what they show changes.
 */
const MarkupTools = memo(function MarkupTools({
  tool,
  onToolChange,
  color,
  onColorChange,
  canUndo = false,
  onUndo,
  onClose,
  tooltips = true,
  orientation = 'horizontal',
  tipSide = 'top',
}: Omit<MarkupToolbarProps, 'className'> & { tooltips?: boolean; orientation?: Orientation; tipSide?: TipSide }) {
  const drawing = isMarkupTool(tool);
  const upright = orientation === 'vertical';
  const group = (label: string, tools: readonly CommentTool[]) => (
    <ToggleGroup aria-label={label} size="sm" spacing={0.5} orientation={orientation} value={tools.includes(tool) ? [tool] : []} onValueChange={(v) => v[0] && onToolChange(v[0] as CommentTool)}>
      {tools.map((t) => {
        const Icon = ICONS[t];
        return (
          <Tooltip key={t} disabled={!tooltips}>
            <TooltipTrigger
              render={
                <ToggleGroupItem
                  value={t}
                  data-flip={t}
                  aria-label={COMMENT_TOOL_LABELS[t]}
                  aria-keyshortcuts={TOOL_KEYS[t]}
                  className="size-8 px-0 data-[state=on]:bg-accent-subtle data-[state=on]:text-accent-text aria-pressed:bg-accent-subtle aria-pressed:text-accent-text"
                />
              }
            >
              <Icon className="size-4" />
            </TooltipTrigger>
            <TooltipContent side={tipSide}>
              {COMMENT_TOOL_LABELS[t]} <Kbd>{TOOL_KEYS[t]}</Kbd>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
  return (
    <>
      {group('Comment', COMMENTING)}

      <Divider orientation={orientation} />

      {group('Draw', DRAWING)}

      {/* Always there, so it can open and shut: a grid track eases between none of its length and all of it. */}
      <div
        aria-hidden={!drawing}
        inert={!drawing}
        data-open={drawing || undefined}
        className={cn(
          'grid opacity-0 transition-[grid-template-columns,grid-template-rows,opacity] duration-300 ease-emphasized data-open:opacity-100 motion-reduce:transition-none',
          upright ? '-my-0.5 grid-rows-[0fr] data-open:grid-rows-[1fr]' : '-mx-0.5 grid-cols-[0fr] data-open:grid-cols-[1fr]',
        )}
      >
        <div className={cn('flex items-center overflow-hidden', upright ? 'min-h-0 flex-col py-0.5' : 'min-w-0 px-0.5')}>
          <Divider orientation={orientation} />
          <ToggleGroup
            aria-label="Colour"
            size="sm"
            spacing={0.5}
            orientation={orientation}
            value={[color]}
            onValueChange={(v) => v[0] && onColorChange(v[0] as MarkupColor)}
            className={upright ? 'px-0.5' : 'py-0.5'}
          >
            {MARKUP_COLORS.map((c, i) => (
              <ToggleGroupItem
                key={c}
                value={c}
                data-flip={`colour-${c}`}
                aria-label={MARKUP_COLOR_LABELS[c]}
                title={MARKUP_COLOR_LABELS[c]}
                className="group/swatch size-8 px-0 hover:bg-muted aria-pressed:bg-transparent data-[state=on]:bg-transparent"
              >
                {/* Each swatch pops in a beat after the one before it as the colours open. */}
                <span
                  aria-hidden
                  className={cn('flex transition-[scale,opacity] duration-300 ease-spring motion-reduce:transition-none', drawing ? 'scale-100 opacity-100' : 'scale-50 opacity-0')}
                  style={{ transitionDelay: drawing ? `${60 + i * 30}ms` : '0ms' }}
                >
                  <span
                    className="size-4.5 rounded-full ring-1 ring-foreground/15 transition-[box-shadow,scale] duration-150 group-hover/swatch:scale-110 group-data-[state=on]/swatch:ring-2 group-data-[state=on]/swatch:ring-foreground group-data-[state=on]/swatch:ring-offset-2 group-data-[state=on]/swatch:ring-offset-popover group-aria-pressed/swatch:ring-2 group-aria-pressed/swatch:ring-foreground group-aria-pressed/swatch:ring-offset-2 group-aria-pressed/swatch:ring-offset-popover"
                    style={{ background: MARKUP_INK[c] }}
                  />
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <Divider orientation={orientation} />

      <Tooltip disabled={!tooltips}>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" data-flip="undo" aria-label="Undo" aria-keyshortcuts="Meta+Z" disabled={!canUndo || !onUndo} onClick={onUndo} />}>
          <Undo2 />
        </TooltipTrigger>
        <TooltipContent side={tipSide}>
          Undo <Kbd>⌘Z</Kbd>
        </TooltipContent>
      </Tooltip>
      {onClose ? (
        <Tooltip disabled={!tooltips}>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" data-flip="close" aria-label="Stop commenting" onClick={onClose} />}>
            <X />
          </TooltipTrigger>
          <TooltipContent side={tipSide}>
            Stop commenting <Kbd>Esc</Kbd>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
});

export interface CommentBarProps extends Omit<MarkupToolbarProps, 'onClose'> {
  /** Comment mode is on: the bar shows its tools. */
  commenting: boolean;
  onCommentingChange: (next: boolean) => void;
  /** Open comments on the screens on show, said on the folded bar. */
  openCount?: number;
  /** Where the browser remembers the place the bar was moved to; not remembered without one. */
  positionKey?: string;
}

/** How long the bar takes to change shape: fold, unfold, stand up or lie down. */
const SHAPE_MS = 320;
/** The controls fly to their new places one after another, from the grip on: this far apart. */
const FLIP_STAGGER_MS = 6;

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Commenting, at hand over the screenshot: folded, one button that turns
 * comment mode on (C); unfolded, the tools to place and draw comments with,
 * and the button that folds it again (Esc).
 *
 * Its grip moves it out of the way of what is under it — dragged, or with the
 * arrow keys; a double-click or Home sends it back — and it stays inside the
 * closest `data-float-bounds`. Brought to the left or right edge, it docks
 * there and stands upright, if it fits: its controls fly from the row into a
 * column, one after another, while the bar itself turns. Pulled away from the
 * edge, it lies down again the same way. Folding, unfolding and the colours
 * opening ease its size.
 */
export function CommentBar({ commenting, onCommentingChange, openCount = 0, positionKey, className, ...tools }: CommentBarProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const flipFrom = useRef<Map<string, Point> | null>(null);
  const { ref, gripRef, dock, handleProps } = useFloatingPlacement<HTMLDivElement, HTMLButtonElement>({
    storageKey: positionKey,
    onBeforeDockChange: () => {
      flipFrom.current = measureControls(contentRef.current, gripRef.current);
    },
  });
  const upright = dock !== null;
  const orientation: Orientation = upright ? 'vertical' : 'horizontal';
  // Tooltips open into the screen, away from the edge the bar stands along.
  const tipSide: TipSide = dock === 'left' ? 'right' : dock === 'right' ? 'left' : 'top';
  const onClose = useCallback(() => onCommentingChange(false), [onCommentingChange]);

  // The bar is changing size. It grows from its middle, so its tools slide along under a pointer that has
  // not moved — and each one it passed would flash its tooltip. So its tooltips are off from the moment it
  // starts to the moment the pointer itself moves again; a click still lands on whatever is under it.
  const drawing = commenting && isMarkupTool(tools.tool);
  const [shape, setShape] = useState({ commenting, drawing, upright });
  const [tooltips, setTooltips] = useState(true);
  if (shape.commenting !== commenting || shape.drawing !== drawing || shape.upright !== upright) {
    setShape({ commenting, drawing, upright });
    setTooltips(false);
  }
  // The bar's size is its content's, left to the layout: the colours ease open inside it, and it follows. Folding,
  // unfolding and turning swap what it holds at once, though; then it is held at the size it had and eased to the
  // new one (`data-swapping`), and let go again. The size it had is the last one the observer saw — nothing is
  // written from the observer, and nothing in all this renders.
  const resizing = useRef(false);
  const shapeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastShape = useRef(shape);
  const lastSize = useRef<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (el.dataset.swapping === undefined) lastSize.current = { width: entry.contentRect.width, height: entry.contentRect.height };
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  useLayoutEffect(() => {
    const was = lastShape.current;
    lastShape.current = shape;
    const el = ref.current;
    const content = contentRef.current;
    if (was === shape || !el || !content) return;
    resizing.current = true;
    const from = lastSize.current;
    if ((was.commenting !== shape.commenting || was.upright !== shape.upright) && from && !prefersReducedMotion()) {
      el.style.width = `${from.width}px`;
      el.style.height = `${from.height}px`;
      el.dataset.swapping = '';
      // The old size has to be laid out before the new one is set, or there is nothing to ease from.
      void el.offsetWidth;
      el.style.width = `${content.offsetWidth}px`;
      el.style.height = `${content.offsetHeight}px`;
    }
    // Started over by every change, so a quick second one gets its own full ease.
    clearTimeout(shapeTimer.current);
    shapeTimer.current = setTimeout(() => {
      resizing.current = false;
      delete el.dataset.swapping;
      el.style.width = '';
      el.style.height = '';
    }, SHAPE_MS);
  }, [shape, ref]);
  useEffect(() => () => clearTimeout(shapeTimer.current), []);

  // Turned upright or back: every control starts where it was, seen from the grip, and flies to its new place.
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    const root = contentRef.current;
    if (!from || !root || prefersReducedMotion()) return;
    const to = measureControls(root, gripRef.current);
    if (!to) return;
    let order = 0;
    for (const el of root.querySelectorAll<HTMLElement>('[data-flip]')) {
      const a = from.get(el.dataset.flip!);
      const b = to.get(el.dataset.flip!);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: SHAPE_MS + 40,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        delay: order++ * FLIP_STAGGER_MS,
        fill: 'backwards',
      });
    }
    // The hairlines change direction rather than place: they fade in once the controls are nearly there.
    for (const el of root.querySelectorAll<HTMLElement>('[data-flip-fade]')) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: SHAPE_MS / 2, easing: 'ease-out', fill: 'backwards' });
    }
  }, [upright, gripRef]);

  // Where the pointer was last seen over the bar: the browser re-sends a still pointer's position once the
  // tools stop under it, and that is not the reviewer reaching for one. Not while it is dragged: the tooltips
  // come back once it is let go and the pointer moves on, rather than costing a render mid-drag. A native
  // listener, so the many moves over the bar do not each go through React's events.
  const lastPointer = useRef<Point | null>(null);
  const tooltipsOn = useRef(tooltips);
  useLayoutEffect(() => {
    tooltipsOn.current = tooltips;
  }, [tooltips]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rearm = (e: PointerEvent) => {
      const last = lastPointer.current;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      if (tooltipsOn.current || resizing.current || !last || el.dataset.dragging !== undefined) return;
      if (Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) > 2) setTooltips(true);
    };
    el.addEventListener('pointermove', rearm);
    return () => el.removeEventListener('pointermove', rearm);
  }, [ref]);
  return (
    <div
      ref={ref}
      data-slot="comment-bar"
      data-dock={dock ?? undefined}
      className={cn(
        'relative box-content animate-rise-in overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-e3 duration-300 ease-emphasized [will-change:translate] data-dragging:ring-1 data-dragging:ring-foreground/10',
        // It eases its size around its content while it changes shape, and glides when a key or a jump home moves
        // it; dragged, it is written under the pointer frame by frame, with nothing easing behind it.
        'transition-none data-gliding:transition-[translate] data-swapping:transition-[width,height] data-swapping:data-gliding:transition-[width,height,translate] motion-reduce:transition-none!',
        className,
      )}
      onPointerLeave={() => {
        lastPointer.current = null;
        if (!resizing.current) setTooltips(true);
      }}
      onKeyDown={() => {
        if (!resizing.current) setTooltips(true);
      }}
    >
      <div ref={contentRef} className={cn('flex w-max items-center gap-1 p-1', upright && 'h-max flex-col')}>
        <button
          ref={gripRef}
          type="button"
          aria-label="Move the comment bar"
          aria-description="Drag, or use the arrow keys; against the left or right edge it stands upright. Double-click or Home puts it back."
          title="Drag to move · to a side edge to dock · double-click to put back"
          className={cn(
            'flex shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 active:cursor-grabbing',
            upright ? 'h-4 w-8' : 'h-8 w-4',
          )}
          {...handleProps}
        >
          {upright ? <GripHorizontal className="size-4" /> : <GripVertical className="size-4" />}
        </button>
        {commenting ? (
          <div
            key="tools"
            role="toolbar"
            aria-label="Comment tools"
            aria-orientation={orientation}
            data-slot="markup-toolbar"
            className={cn('flex animate-fade-in items-center gap-1', upright && 'flex-col')}
          >
            <MarkupTools {...tools} tooltips={tooltips} orientation={orientation} tipSide={tipSide} onClose={onClose} />
          </div>
        ) : (
          <div key="folded" className="flex animate-fade-in items-center">
            <Tooltip disabled={!tooltips}>
              {upright ? (
                // Upright, the bar is as narrow as a button: the icon alone, the open count a badge on its corner.
                <TooltipTrigger
                  render={
                    <Button variant="ghost" size="icon" data-flip="comment" aria-label="Comment" aria-pressed={false} aria-keyshortcuts="C" className="relative size-8" onClick={() => onCommentingChange(true)} />
                  }
                >
                  <MessageSquarePlus />
                  {openCount ? (
                    <span aria-hidden title={`${openCount} open`} className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent-subtle px-1 text-center text-[10px] leading-4 text-accent-text tabular-nums ring-2 ring-popover">
                      {openCount}
                    </span>
                  ) : null}
                </TooltipTrigger>
              ) : (
                <TooltipTrigger render={<Button variant="ghost" size="sm" data-flip="comment" aria-pressed={false} aria-keyshortcuts="C" className="gap-2 px-3" onClick={() => onCommentingChange(true)} />}>
                  <MessageSquarePlus /> Comment
                  {openCount ? (
                    <span aria-hidden title={`${openCount} open`} className="rounded-full bg-accent-subtle px-1.5 text-label-xs text-accent-text tabular-nums">
                      {openCount}
                    </span>
                  ) : null}
                  <Kbd aria-hidden className="h-4 min-w-4 text-[10px]">
                    C
                  </Kbd>
                </TooltipTrigger>
              )}
              <TooltipContent side={tipSide}>
                {upright ? (
                  <>
                    Comment <Kbd>C</Kbd>
                  </>
                ) : (
                  'Click to pin a comment, drag for an area, or draw on the screen'
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

interface Point {
  x: number;
  y: number;
}

/** Where each named control sits, seen from the grip's middle: the point that stays put while the bar turns. */
function measureControls(root: HTMLElement | null, grip: HTMLElement | null): Map<string, Point> | null {
  if (!root || !grip) return null;
  const g = grip.getBoundingClientRect();
  const ox = g.left + g.width / 2;
  const oy = g.top + g.height / 2;
  const out = new Map<string, Point>();
  for (const el of root.querySelectorAll<HTMLElement>('[data-flip]')) {
    const r = el.getBoundingClientRect();
    out.set(el.dataset.flip!, { x: r.left - ox, y: r.top - oy });
  }
  return out;
}
