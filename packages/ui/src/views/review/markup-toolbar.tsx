'use client';

import { Circle, Highlighter, MessageSquarePlus, MoveUpRight, Pencil, Square, Undo2, X } from 'lucide-react';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/tooltip';
import { cn } from '../../lib/cn';
import { COMMENT_TOOL_LABELS, COMMENT_TOOLS, MARKUP_COLOR_LABELS, MARKUP_COLORS, MARKUP_INK, type CommentTool, type MarkupColor } from '../../lib/review-markup';

const ICONS: Record<CommentTool, React.ComponentType<{ className?: string }>> = {
  pin: MessageSquarePlus,
  pen: Pencil,
  highlighter: Highlighter,
  arrow: MoveUpRight,
  rect: Square,
  ellipse: Circle,
};

/** The key that picks each tool while commenting: its place in the bar. */
export const TOOL_KEYS: Record<CommentTool, string> = Object.fromEntries(COMMENT_TOOLS.map((t, i) => [t, String(i + 1)])) as Record<CommentTool, string>;

export interface MarkupToolbarProps {
  tool: CommentTool;
  onToolChange: (next: CommentTool) => void;
  color: MarkupColor;
  onColorChange: (next: MarkupColor) => void;
  /** Shapes drawn for the comment being written: undo takes the last one back. */
  shapes?: number;
  onUndo?: () => void;
  /** Leave comment mode. */
  onClose?: () => void;
  className?: string;
}

/**
 * The tools of comment mode, floating over the screenshot the way a design
 * tool's are: a pin (or, dragged, an area) and five drawing tools — pen,
 * highlighter, arrow, rectangle, ellipse — then the colour they draw in,
 * and undo for the comment being drawn. The keys 1–6 pick a tool. The
 * colours have names, so a comment can say "the blue box".
 */
export function MarkupToolbar({ tool, onToolChange, color, onColorChange, shapes = 0, onUndo, onClose, className }: MarkupToolbarProps) {
  const drawing = tool !== 'pin';
  return (
    <div
      role="toolbar"
      aria-label="Comment tools"
      data-slot="markup-toolbar"
      className={cn('flex animate-rise-in items-center gap-1 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-e3', className)}
    >
      <ToggleGroup aria-label="Tool" size="sm" spacing={0.5} value={[tool]} onValueChange={(v) => v[0] && onToolChange(v[0] as CommentTool)}>
        {COMMENT_TOOLS.map((t) => {
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

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      <ToggleGroup
        aria-label="Colour"
        size="sm"
        spacing={0.5}
        value={[color]}
        disabled={!drawing}
        onValueChange={(v) => v[0] && onColorChange(v[0] as MarkupColor)}
        className={cn('transition-opacity duration-150', !drawing && 'opacity-40')}
      >
        {MARKUP_COLORS.map((c) => (
          <ToggleGroupItem key={c} value={c} aria-label={MARKUP_COLOR_LABELS[c]} title={drawing ? MARKUP_COLOR_LABELS[c] : 'Pick a drawing tool to choose a colour'} className="group/swatch size-8 px-0 hover:bg-muted aria-pressed:bg-transparent data-[state=on]:bg-transparent">
            <span
              aria-hidden
              className="size-4.5 rounded-full ring-1 ring-foreground/15 transition-[box-shadow,scale] duration-150 group-hover/swatch:scale-110 group-data-[state=on]/swatch:ring-2 group-data-[state=on]/swatch:ring-foreground group-data-[state=on]/swatch:ring-offset-2 group-data-[state=on]/swatch:ring-offset-popover group-aria-pressed/swatch:ring-2 group-aria-pressed/swatch:ring-foreground group-aria-pressed/swatch:ring-offset-2 group-aria-pressed/swatch:ring-offset-popover"
              style={{ background: MARKUP_INK[c] }}
            />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Undo the last shape" aria-keyshortcuts="Meta+Z" disabled={shapes === 0 || !onUndo} onClick={onUndo} />}>
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
