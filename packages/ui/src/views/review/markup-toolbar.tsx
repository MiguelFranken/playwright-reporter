'use client';

import { Circle, Eraser, Highlighter, MessageSquarePlus, MoveUpRight, Pencil, Square, SquareDashedMousePointer, Undo2, X } from 'lucide-react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/tooltip';
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
export function MarkupToolbar({ tool, onToolChange, color, onColorChange, canUndo = false, onUndo, onClose, className }: MarkupToolbarProps) {
  const drawing = isMarkupTool(tool);
  const group = (label: string, tools: readonly CommentTool[]) => (
    <ToggleGroup aria-label={label} size="sm" spacing={0.5} value={tools.includes(tool) ? [tool] : []} onValueChange={(v) => v[0] && onToolChange(v[0] as CommentTool)}>
      {tools.map((t) => {
        const Icon = ICONS[t];
        return (
          <Tooltip key={t}>
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
    <div
      role="toolbar"
      aria-label="Comment tools"
      data-slot="markup-toolbar"
      className={cn('flex animate-rise-in items-center gap-1 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-e3', className)}
    >
      {group('Comment', COMMENTING)}

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      {group('Draw', DRAWING)}

      {drawing ? (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <ToggleGroup aria-label="Colour" size="sm" spacing={0.5} value={[color]} onValueChange={(v) => v[0] && onColorChange(v[0] as MarkupColor)} className="animate-rise-in">
            {MARKUP_COLORS.map((c) => (
              <ToggleGroupItem key={c} value={c} aria-label={MARKUP_COLOR_LABELS[c]} title={MARKUP_COLOR_LABELS[c]} className="group/swatch size-8 px-0 hover:bg-muted aria-pressed:bg-transparent data-[state=on]:bg-transparent">
                <span
                  aria-hidden
                  className="size-4.5 rounded-full ring-1 ring-foreground/15 transition-[box-shadow,scale] duration-150 group-hover/swatch:scale-110 group-data-[state=on]/swatch:ring-2 group-data-[state=on]/swatch:ring-foreground group-data-[state=on]/swatch:ring-offset-2 group-data-[state=on]/swatch:ring-offset-popover group-aria-pressed/swatch:ring-2 group-aria-pressed/swatch:ring-foreground group-aria-pressed/swatch:ring-offset-2 group-aria-pressed/swatch:ring-offset-popover"
                  style={{ background: MARKUP_INK[c] }}
                />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </>
      ) : null}

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Undo" aria-keyshortcuts="Meta+Z" disabled={!canUndo || !onUndo} onClick={onUndo} />}>
          <Undo2 />
        </TooltipTrigger>
        <TooltipContent side="top">
          Undo <Kbd>⌘Z</Kbd>
        </TooltipContent>
      </Tooltip>
      {onClose ? (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Stop commenting" onClick={onClose} />}>
            <X />
          </TooltipTrigger>
          <TooltipContent side="top">
            Stop commenting <Kbd>Esc</Kbd>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export interface CommentBarProps extends Omit<MarkupToolbarProps, 'onClose'> {
  /** Comment mode is on: the bar shows its tools. */
  commenting: boolean;
  onCommentingChange: (next: boolean) => void;
  /** Open comments on the screens on show, said on the folded bar. */
  openCount?: number;
}

/**
 * Commenting, at hand over the screenshot: folded, one button that turns
 * comment mode on (C); unfolded, the tools to place and draw comments with,
 * and the button that folds it again (Esc).
 */
export function CommentBar({ commenting, onCommentingChange, openCount = 0, className, ...tools }: CommentBarProps) {
  if (commenting) return <MarkupToolbar {...tools} className={className} onClose={() => onCommentingChange(false)} />;
  return (
    <div data-slot="comment-bar" className={cn('flex animate-rise-in items-center rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-e3', className)}>
      <Tooltip>
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
  );
}
