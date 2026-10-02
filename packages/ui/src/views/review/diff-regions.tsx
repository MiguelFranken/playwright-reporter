'use client';

import { EyeOff, Sparkles } from 'lucide-react';
import { Button } from '../../components/button';
import { cn } from '../../lib/cn';
import { fixVisualDiffPrompt, investigateVisualDiffPrompt } from '../../lib/ai-handoff';
import type { DiffRegion } from '../../lib/review';
import { contains, decodeComparisonId, encodeComparisonId, intersects, regionId, regionLabel, type Rect } from '../../lib/visual-diff';
import { DebugWithAiMenu } from '../../patterns/debug-with-ai-menu';

/** The comparison id of two captures, or `null` when either id is not a capture id (fixtures, legacy rows). */
export function comparisonIdOf(baseCaptureId: string | null | undefined, headCaptureId: string | null | undefined): string | null {
  if (!baseCaptureId || !headCaptureId) return null;
  try {
    const id = encodeComparisonId(baseCaptureId, headCaptureId);
    return decodeComparisonId(id) ? id : null;
  } catch {
    return null;
  }
}

/** How the areas left out touch a region: not at all, in part, or wholly. */
export function regionIgnore(region: Rect, ignored: readonly Rect[]): 'none' | 'partial' | 'full' {
  const touching = ignored.filter((r) => intersects(r, region));
  if (touching.length === 0) return 'none';
  return touching.some((r) => contains(r, region)) ? 'full' : 'partial';
}

/**
 * The changed regions of a measured comparison as a list the reviewer can
 * step through — the same `D1`, `D2`… an agent sees on the annotated image
 * and in `get_visual_diff` — each with its size and whether an area left out
 * covers it. Selecting one shows it on the image.
 */
export function DiffRegionList({
  regions,
  ignored = [],
  active,
  onSelect,
  className,
}: {
  regions: readonly DiffRegion[];
  /** Areas left out of the comparison, to say which regions they cover. */
  ignored?: readonly Rect[];
  active: number | null;
  onSelect: (index: number) => void;
  className?: string;
}) {
  if (regions.length === 0) return null;
  return (
    <ol className={cn('flex flex-col gap-0.5', className)} aria-label="Changed regions">
      {regions.map((r, i) => {
        const ignore = regionIgnore(r, ignored);
        const selected = active === i;
        return (
          <li key={regionId(r)}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(i)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                selected ? 'bg-danger-subtle text-danger-text ring-1 ring-danger-border' : 'hover:bg-muted',
              )}
            >
              <span className={cn('flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-label-xs tabular-nums', selected ? 'bg-danger-text text-surface' : 'bg-surface text-danger-text ring-1 ring-danger-border')}>
                {regionLabel(i)}
              </span>
              <span className="min-w-0 flex-1 truncate tabular-nums text-muted-foreground">
                {r.width} × {r.height} px at {r.x}, {r.y}
              </span>
              <span className="shrink-0 tabular-nums">{r.pixels.toLocaleString('en')} px</span>
              {ignore !== 'none' ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground" title={ignore === 'full' ? 'An area left out covers this region' : 'An area left out covers part of this region'}>
                  <EyeOff aria-hidden className="size-3" />
                  <span className="sr-only">{ignore === 'full' ? 'left out' : 'partly left out'}</span>
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Hands a visual difference to the user's AI assistant: "Investigate" reads
 * only; "Fix cause" authorises code changes in the connected repository. Both
 * name the comparison (the two captures) and the project, never image links.
 */
export function VisualDiffAiActions({
  comparisonId,
  regions,
  active,
  project,
  screen,
  setupHref,
  className,
}: {
  comparisonId: string;
  regions: readonly DiffRegion[];
  /** The selected region, whose id alone the fix prompt names; every region otherwise. */
  active: number | null;
  project?: string | null;
  screen?: string | null;
  setupHref: string;
  className?: string;
}) {
  const ids = active != null && regions[active] ? [regionId(regions[active])] : regions.map((r) => regionId(r));
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="group" aria-label="Visual difference with AI">
      <DebugWithAiMenu prompt={investigateVisualDiffPrompt({ comparisonId, project, screen })} setupHref={setupHref} label="Investigate with AI" size="xs" />
      <DebugWithAiMenu prompt={fixVisualDiffPrompt({ comparisonId, regionIds: ids, project, screen })} setupHref={setupHref} label={active != null ? `Fix cause of ${regionLabel(active)} with AI` : 'Fix cause with AI'} size="xs" />
    </div>
  );
}

/** A quiet note that the comparison can be handed to an agent, for places without room for the menus. */
export function VisualDiffHint({ comparisonId, className }: { comparisonId: string; className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Sparkles aria-hidden className="size-3.5" />
      <span>
        Comparison <code className="text-code-s select-all">{comparisonId}</code>
      </span>
      <Button variant="ghost" size="xs" onClick={() => void navigator.clipboard?.writeText(comparisonId)}>
        Copy
      </Button>
    </p>
  );
}
