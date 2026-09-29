import { ArrowDownUp, CheckCheck, Equal, Loader2, ScanSearch, TriangleAlert } from 'lucide-react';
import { Badge } from '../../components/badge';
import { cn } from '../../lib/cn';
import { describeDiff, diffMagnitude, formatChangedShare, sizeChange, type DiffBand, type DiffRegion, type ReviewDecisionView, type ReviewDiffView } from '../../lib/review';
import { toneBadge, type Tone } from '../../lib/tone';

const MAGNITUDE_TONE: Record<'none' | 'minor' | 'major', Tone> = { none: 'success', minor: 'info', major: 'warning' };

/**
 * A measured comparison in a word or two, for the storyboard's screens:
 * `2.4%` changed, `No visible change`, `Auto-approved`, or `Measuring…`.
 * Quiet when there is nothing measured to say.
 */
export function DiffBadge({ diff, decision, className }: { diff?: ReviewDiffView | null; decision?: ReviewDecisionView | null; className?: string }) {
  if (decision?.source === 'tolerance') {
    return (
      <Badge variant="outline" className={cn('gap-1 font-medium', toneBadge.success, 'border-transparent', className)} title={decision.comment ?? undefined}>
        <CheckCheck className="size-3" /> Auto-approved
      </Badge>
    );
  }
  if (!diff) return null;
  if (diff.state === 'pending') {
    return (
      <Badge variant="outline" className={cn('gap-1 font-medium', toneBadge.neutral, 'border-transparent', className)}>
        <Loader2 className="size-3 motion-safe:animate-spin" /> Measuring
      </Badge>
    );
  }
  const magnitude = diffMagnitude(diff);
  if (!magnitude) return null;
  const Icon = magnitude === 'none' ? Equal : ScanSearch;
  const text = magnitude === 'none' ? 'No visible change' : formatChangedShare(diff.ratio);
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 font-medium tabular-nums', toneBadge[MAGNITUDE_TONE[magnitude]], 'border-transparent', className)}
      title={describeDiff(diff)}
      aria-label={magnitude === 'none' ? text : `${text} changed`}
    >
      <Icon className="size-3" /> {text}
    </Badge>
  );
}

function bandText(bands: readonly DiffBand[], verb: string) {
  if (bands.length === 0) return null;
  const px = bands.reduce((n, b) => n + b.height, 0);
  const at = bands.length === 1 ? ` at y ${bands[0].y}` : ` in ${bands.length} places`;
  return `${px} px ${verb}${at}`;
}

/**
 * What the measurement found, for the viewer's side panel: how much changed
 * and where, whether the page changed size or its content moved, and whether
 * the project's tolerance let it through.
 */
export function DiffSummary({ diff, referenceLabel, className }: { diff: ReviewDiffView; referenceLabel: string; className?: string }) {
  const against = referenceLabel.toLowerCase();
  if (diff.state === 'pending') {
    return (
      <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)} role="status">
        <Loader2 className="size-3.5 motion-safe:animate-spin" /> Measuring the difference to {against}…
      </p>
    );
  }
  if (diff.state === 'failed' || diff.state === 'too_large') {
    return (
      <p className={cn('flex items-start gap-1.5 text-xs text-muted-foreground', className)}>
        <TriangleAlert className="mt-px size-3.5 shrink-0" />
        <span>
          {diff.state === 'too_large' ? 'Too large to measure' : 'Could not be measured'}
          {diff.error ? `: ${diff.error}` : '.'} The comparisons above still work by eye.
        </span>
      </p>
    );
  }
  const none = diff.changedPixels === 0 && !diff.sizeChanged;
  const size = sizeChange(diff);
  const inserted = diff.shift ? bandText(diff.shift.inserted, 'added') : null;
  const removed = diff.shift ? bandText(diff.shift.removed, 'removed') : null;
  return (
    <div className={cn('flex flex-col gap-1.5 text-xs', className)}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <DiffBadge diff={diff} />
        <span className="text-muted-foreground">
          {none ? `Same pixels as ${against}, apart from anti-aliasing.` : `${diff.changedPixels.toLocaleString('en')} of ${diff.totalPixels.toLocaleString('en')} pixels differ from ${against}.`}
        </span>
      </p>
      {none ? null : (
        <p className="text-muted-foreground">
          {diff.regions.length}
          {diff.regionsTruncated ? '+' : ''} {diff.regions.length === 1 ? 'changed region' : 'changed regions'}
          {size ? ` · ${size}` : ''}
        </p>
      )}
      {inserted || removed ? (
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <ArrowDownUp className="mt-px size-3.5 shrink-0" />
          <span>Content moved: {[inserted, removed].filter(Boolean).join(', ')}. Everything else only shifted.</span>
        </p>
      ) : null}
      {diff.withinTolerance ? <p className="text-success-text">Within the project&apos;s tolerance.</p> : null}
    </div>
  );
}

/**
 * Boxes over an image, in percent of it, so they follow any zoom: the
 * changed regions (numbered, the active one emphasised) or the ignored
 * areas (hatched). `coverHeight` is how many image pixels the picture
 * shows from the top — a preview shows only the first screen.
 */
export function DiffMarks({
  regions,
  width,
  height,
  coverHeight = height,
  active,
  numbered = false,
  kind = 'change',
  onSelect,
}: {
  regions: readonly Pick<DiffRegion, 'x' | 'y' | 'width' | 'height'>[];
  width: number;
  height: number;
  coverHeight?: number;
  active?: number | null;
  numbered?: boolean;
  kind?: 'change' | 'ignore';
  onSelect?: (index: number) => void;
}) {
  if (!width || !coverHeight) return null;
  return (
    <div aria-hidden={!onSelect} className="pointer-events-none absolute inset-0">
      {regions.map((r, i) => {
        if (r.y >= coverHeight) return null;
        const style = {
          left: `${(r.x / width) * 100}%`,
          top: `${(r.y / coverHeight) * 100}%`,
          width: `${(r.width / width) * 100}%`,
          height: `${(Math.min(r.height, coverHeight - r.y) / coverHeight) * 100}%`,
        };
        const isActive = active === i;
        const box = cn(
          'absolute min-h-1.5 min-w-1.5 rounded-[3px]',
          kind === 'ignore'
            ? 'border border-dashed border-muted-foreground bg-[repeating-linear-gradient(45deg,var(--muted)_0_4px,transparent_4px_8px)] opacity-80'
            : isActive
              ? 'z-10 outline-2 outline-offset-2 outline-danger-solid ring-2 ring-danger-solid'
              : 'ring-2 ring-danger-solid/70',
        );
        return onSelect ? (
          <button key={i} type="button" style={style} className={cn(box, 'pointer-events-auto cursor-pointer')} aria-label={`Change ${i + 1}`} aria-pressed={isActive} onClick={() => onSelect(i)}>
            {numbered ? <RegionNumber n={i + 1} active={isActive} /> : null}
          </button>
        ) : (
          <span key={i} style={style} className={box}>
            {numbered ? <RegionNumber n={i + 1} active={isActive} /> : null}
          </span>
        );
      })}
    </div>
  );
}

function RegionNumber({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cn(
        'absolute -top-2.5 -left-2.5 flex size-5 items-center justify-center rounded-full text-label-xs tabular-nums shadow-e1',
        active ? 'bg-danger-text text-surface' : 'bg-surface text-danger-text ring-1 ring-danger-border',
      )}
    >
      {n}
    </span>
  );
}
