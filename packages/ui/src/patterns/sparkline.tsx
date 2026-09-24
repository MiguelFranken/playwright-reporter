'use client';

import * as React from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { CHART_MARK } from '../lib/chart';
import { cn } from '../lib/cn';
import type { Tone } from '../lib/tone';

/**
 * The trend line that rides under a stat tile.
 *
 * It is deliberately the poorest chart in the system: no axes, no grid, no
 * labels, no hover. A sparkline answers exactly one question — "which way has
 * this been going" — and every attempt to make it answer a second one turns it
 * into a bad chart in a space too small for a good one. The number above it is
 * the value; this is only its shape.
 *
 * Purely decorative to a screen reader: the tile's value and delta already say
 * everything the line can, so it is hidden rather than announced as a chart with
 * no readable content.
 */

const TONE_COLOR: Record<Tone, string> = {
  success: 'var(--success-solid)',
  warning: 'var(--warning-solid)',
  danger: 'var(--danger-solid)',
  info: 'var(--info-solid)',
  neutral: 'var(--neutral-solid)',
};

export function Sparkline({
  data,
  tone = 'info',
  className,
}: {
  /** Oldest first. Fewer than two points draws nothing. */
  data: readonly number[];
  tone?: Tone;
  className?: string;
}) {
  const id = React.useId().replace(/:/g, '');
  const color = TONE_COLOR[tone];
  const rows = React.useMemo(() => data.map((value, i) => ({ i, value })), [data]);

  // Recharts measures its container in the browser; on the server it renders a
  // differently sized SVG and hydration mismatches. The empty box holds the
  // layout until it mounts, so nothing jumps.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (data.length < 2) return null;

  return (
    <div className={cn('h-8 w-full', className)} aria-hidden>
      {mounted ? (
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 96, height: 32 }}>
          {/* Recharts' accessibility layer makes the plot a focusable widget.
              That is right for a chart a reader can explore, and wrong here: the
              box is `aria-hidden`, so a focus stop inside it would be a tab stop
              that announces nothing (axe: aria-hidden-focus). */}
          <AreaChart
            data={rows}
            margin={{ top: 3, right: 0, left: 0, bottom: 1 }}
            accessibilityLayer={false}
            tabIndex={-1}
          >
            {/* The scale is the data's own range, not zero-based: a sparkline
                shows a shape, and 94→99 against a zero baseline is a flat line
                that says nothing. The value above it carries the magnitude. */}
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <defs>
              <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={CHART_MARK.areaOpacity.top} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              dataKey="value"
              type="monotone"
              stroke={color}
              strokeWidth={1.5}
              strokeLinecap="round"
              fill={`url(#spark-${id})`}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
