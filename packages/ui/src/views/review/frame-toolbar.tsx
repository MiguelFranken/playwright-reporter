'use client';

import { ArrowLeftRight } from 'lucide-react';
import { Button } from '../../components/button';
import { cn } from '../../lib/cn';
import { FRAME_PRESETS, ZOOM_LEVELS, type FramePreset, type FrameSettings, type FrameSize } from '../../lib/review';

const field =
  'h-7 rounded-md border border-input bg-surface px-2 text-label-s text-foreground tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-60 dark:bg-surface-sunken';

/**
 * The screen the viewer shows captures on, set like a browser's device
 * toolbar: a preset, the frame's width × height in CSS pixels, and a zoom.
 * "As captured" keeps every variant at its own viewport; any other size
 * applies to all of them, so a desktop capture can be read at phone width.
 */
export function FrameToolbar({
  value,
  onChange,
  captured,
  className,
}: {
  value: FrameSettings;
  onChange: (next: FrameSettings) => void;
  /** The viewport of the capture shown, when there is exactly one; fills in the size for "As captured". */
  captured?: FrameSize | null;
  className?: string;
}) {
  const size = value.preset === 'captured' && captured ? captured : { width: value.width, height: value.height };
  const sizeEditable = value.preset !== 'captured' || Boolean(captured);
  const setPreset = (preset: FramePreset) => {
    const def = FRAME_PRESETS.find((p) => p.value === preset);
    const next = def && 'size' in def ? def.size : preset === 'custom' ? size : { width: value.width, height: value.height };
    onChange({ ...value, preset, ...next });
  };
  const setSize = (patch: Partial<FrameSize>) => onChange({ ...value, preset: 'custom', ...size, ...patch });

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 text-label-s text-muted-foreground', className)} role="group" aria-label="Screen size">
      <label className="flex items-center gap-2">
        <span>Screen</span>
        <select className={field} value={value.preset} onChange={(e) => setPreset(e.target.value as FramePreset)}>
          {FRAME_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          className={cn(field, 'w-18')}
          min={160}
          max={3840}
          value={size.width}
          disabled={!sizeEditable}
          onChange={(e) => e.target.value && setSize({ width: Number(e.target.value) })}
          aria-label="Screen width"
        />
        <span aria-hidden>×</span>
        <input
          type="number"
          className={cn(field, 'w-18')}
          min={160}
          max={4000}
          value={size.height}
          disabled={!sizeEditable}
          onChange={(e) => e.target.value && setSize({ height: Number(e.target.value) })}
          aria-label="Screen height"
        />
        <Button variant="ghost" size="icon-xs" aria-label="Rotate screen" disabled={!sizeEditable} onClick={() => setSize({ width: size.height, height: size.width })}>
          <ArrowLeftRight />
        </Button>
      </div>
      <label className="flex items-center gap-2">
        <span>Zoom</span>
        <select className={field} value={String(value.zoom)} onChange={(e) => onChange({ ...value, zoom: e.target.value === 'fit' ? 'fit' : Number(e.target.value) })}>
          <option value="fit">Fit</option>
          {ZOOM_LEVELS.map((z) => (
            <option key={z} value={String(z)}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
