'use client';

import { Circle, Eraser, GripVertical, Highlighter, MessageSquarePlus, MoveUpRight, Pencil, Square, SquareDashedMousePointer, Undo2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/tooltip';
import { useFloatingOffset } from '../../hooks/use-floating-offset';
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

/** What the bar holds; the colours slide open beside the tools while one draws, and slide shut again. */
function MarkupTools({ tool, onToolChange, color, onColorChange, canUndo = false, onUndo, onClose, tooltips = true }: Omit<MarkupToolbarProps, 'className'> & { tooltips?: boolean }) {
  const drawing = isMarkupTool(tool);
  const group = (label: string, tools: readonly CommentTool[]) => (
    <ToggleGroup aria-label={label} size="sm" spacing={0.5} value={tools.includes(tool) ? [tool] : []} onValueChange={(v) => v[0] && onToolChange(v[0] as CommentTool)}>
      {tools.map((t) => {
        const Icon = ICONS[t];
        return (
          <Tooltip key={t} disabled={!tooltips}>
            <TooltipTrigger render={<ToggleGroupItem value={t} aria-label={COMMENT_TOOL_LABELS[t]} aria-keyshortcuts={TOOL_KEYS[t]} className="size-8 px-0 data-[state=on]:bg-accent-subtle data-[state=on]:text-accent-text aria-pressed:bg-accent-subtle aria-pressed:text-accent-text" />}>
              <Icon className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top">
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

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      {group('Draw', DRAWING)}

      {/* Always there, so it can open and shut: a grid column eases between none of its width and all of it. */}
      <div
        aria-hidden={!drawing}
        inert={!drawing}
        data-open={drawing || undefined}
        className="-mx-0.5 grid grid-cols-[0fr] opacity-0 transition-[grid-template-columns,opacity] duration-300 ease-emphasized data-open:grid-cols-[1fr] data-open:opacity-100 motion-reduce:transition-none"
      >
        <div className="flex min-w-0 items-center overflow-hidden px-0.5">
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
          <ToggleGroup aria-label="Colour" size="sm" spacing={0.5} value={[color]} onValueChange={(v) => v[0] && onColorChange(v[0] as MarkupColor)} className="py-0.5">
            {MARKUP_COLORS.map((c, i) => (
              <ToggleGroupItem
                key={c}
                value={c}
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

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      <Tooltip disabled={!tooltips}>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Undo" aria-keyshortcuts="Meta+Z" disabled={!canUndo || !onUndo} onClick={onUndo} />}>
          <Undo2 />
        </TooltipTrigger>
        <TooltipContent side="top">
          Undo <Kbd>⌘Z</Kbd>
        </TooltipContent>
      </Tooltip>
      {onClose ? (
        <Tooltip disabled={!tooltips}>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Stop commenting" onClick={onClose} />}>
            <X />
          </TooltipTrigger>
          <TooltipContent side="top">
            Stop commenting <Kbd>Esc</Kbd>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
}

export interface CommentBarProps extends Omit<MarkupToolbarProps, 'onClose'> {
  /** Comment mode is on: the bar shows its tools. */
  commenting: boolean;
  onCommentingChange: (next: boolean) => void;
  /** Open comments on the screens on show, said on the folded bar. */
  openCount?: number;
  /** Where the browser remembers the place the bar was moved to; not remembered without one. */
  positionKey?: string;
}

/**
 * Commenting, at hand over the screenshot: folded, one button that turns
 * comment mode on (C); unfolded, the tools to place and draw comments with,
 * and the button that folds it again (Esc). Its grip moves it out of the way
 * of what is under it — dragged, or with the arrow keys; a double-click or
 * Home sends it back — and it stays inside the closest `data-float-bounds`.
 * Folding, unfolding and the colours opening ease its width.
 */
export function CommentBar({ commenting, onCommentingChange, openCount = 0, positionKey, className, ...tools }: CommentBarProps) {
  const { ref, offset, dragging, handleProps } = useFloatingOffset<HTMLDivElement>(positionKey);
  const width = useContentWidth<HTMLDivElement>();
  // Folding and unfolding swap what the bar holds at once, so the bar eases between the two widths. The colours
  // ease inside it already: then the bar keeps to its content, rather than trailing it.
  const drawing = commenting && isMarkupTool(tools.tool);
  const [shape, setShape] = useState({ commenting, drawing });
  const [swapping, setSwapping] = useState(false);
  // The bar is changing width. It grows from its middle, so its tools slide along under a pointer that has
  // not moved — and each one it passed would flash its tooltip. So its tooltips are off from the moment it
  // starts to the moment the pointer itself moves again; a click still lands on whatever is under it.
  const [resizing, setResizing] = useState(false);
  const [tooltips, setTooltips] = useState(true);
  if (shape.commenting !== commenting || shape.drawing !== drawing) {
    setShape({ commenting, drawing });
    if (shape.commenting !== commenting) setSwapping(true);
    setResizing(true);
    setTooltips(false);
  }
  useEffect(() => {
    if (!resizing) return;
    // Started over by every change, so a quick second one gets its own full ease.
    const timer = setTimeout(() => {
      setResizing(false);
      setSwapping(false);
    }, 320);
    return () => clearTimeout(timer);
  }, [resizing, shape]);
  // Where the pointer was last seen over the bar: the browser re-sends a still pointer's position once the
  // tools stop under it, and that is not the reviewer reaching for one.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const rearm = (e: React.PointerEvent) => {
    const last = lastPointer.current;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    if (tooltips || resizing || !last) return;
    if (Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) > 2) setTooltips(true);
  };
  return (
    <div
      ref={ref}
      data-slot="comment-bar"
      data-dragging={dragging || undefined}
      className={cn(
        'box-content animate-rise-in overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-e3 duration-300 ease-emphasized data-dragging:ring-1 data-dragging:ring-foreground/10 motion-reduce:transition-none',
        // Dragged, it follows the pointer; let go or nudged, it glides.
        dragging ? (swapping ? 'transition-[width]' : 'transition-none') : swapping ? 'transition-[width,translate]' : 'transition-[translate]',
        className,
      )}
      style={{ width: width.value, translate: `${offset.x}px ${offset.y}px` }}
      onPointerMove={rearm}
      onPointerLeave={() => {
        lastPointer.current = null;
        if (!resizing) setTooltips(true);
      }}
      onKeyDown={() => {
        if (!resizing) setTooltips(true);
      }}
    >
      <div ref={width.ref} className="flex w-max items-center gap-1 p-1">
        <button
          type="button"
          aria-label="Move the comment bar"
          aria-description="Drag, or use the arrow keys. Double-click or Home puts it back."
          title="Drag to move · double-click to put back"
          className="flex h-8 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 active:cursor-grabbing"
          {...handleProps}
        >
          <GripVertical className="size-4" />
        </button>
        {commenting ? (
          <div key="tools" role="toolbar" aria-label="Comment tools" data-slot="markup-toolbar" className="flex animate-fade-in items-center gap-1">
            <MarkupTools {...tools} tooltips={tooltips} onClose={() => onCommentingChange(false)} />
          </div>
        ) : (
          <div key="folded" className="flex animate-fade-in items-center">
            <Tooltip disabled={!tooltips}>
              <TooltipTrigger render={<Button variant="ghost" size="sm" aria-pressed={false} aria-keyshortcuts="C" className="gap-2 px-3" onClick={() => onCommentingChange(true)} />}>
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
              <TooltipContent side="top">Click to pin a comment, drag for an area, or draw on the screen</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The width of what an element holds, measured as it changes — so the element
 * around it can be given that width explicitly and ease to it (CSS cannot
 * transition `width: auto`). Undefined until measured, which is auto.
 */
function useContentWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [value, setValue] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setValue(el.offsetWidth);
    const observer = new ResizeObserver(() => setValue(el.offsetWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, value };
}
