import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip';
import { Sparkline } from './sparkline';
import { cn } from '../lib/cn';
import type { Tone } from '../lib/tone';

/** Reliability-grade text colours, re-exported for the cards that use them. */
export { gradeText as toneClass } from '../lib/tone';

/**
 * A single reading: what it is, what it says, which way it is going, and the
 * shape it took getting there.
 *
 * The trend line is the last of those and the least of them — it carries no
 * axis, no labels and no hover, because everything it could say precisely is
 * already said by the value and the delta above it. A stat tile that needs a
 * readable chart wants to be a chart.
 */
export function MetricCard({
  label,
  value,
  subtext,
  hint,
  badge,
  delta,
  trend,
  trendTone = 'info',
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  hint?: string;
  badge?: React.ReactNode;
  /** Movement beside the value — a `<ChartDelta>`. */
  delta?: React.ReactNode;
  /** Oldest first. Under two points nothing is drawn. */
  trend?: readonly number[];
  trendTone?: Tone;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card size="sm" className="gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
          {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
          <span className="truncate">{label}</span>
          {hint ? (
            <Tooltip>
              <TooltipTrigger
                className="ms-auto inline-flex text-muted-foreground/60 transition-colors hover:text-foreground"
                aria-label={`About ${label}`}
              >
                <Info className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{hint}</TooltipContent>
            </Tooltip>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/* Proportional figures: tabular digits space a headline out. */}
          <span className="text-metric" style={{ fontVariantNumeric: 'proportional-nums' }}>
            {value}
          </span>
          {badge}
          {delta}
        </div>
        {subtext ? <p className={cn('mt-2 truncate text-xs text-muted-foreground')}>{subtext}</p> : null}
        {trend ? <Sparkline data={trend} tone={trendTone} className="mt-3" /> : null}
      </CardContent>
    </Card>
  );
}
