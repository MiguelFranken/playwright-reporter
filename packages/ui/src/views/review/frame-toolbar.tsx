'use client';

import { ArrowLeftRight } from 'lucide-react';
import { Button } from '../../components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { cn } from '../../lib/cn';
import { FRAME_PRESETS, ZOOM_LEVELS, type FramePreset, type FrameSettings, type FrameSize } from '../../lib/review';

const ZOOM_ITEMS = [{ value: 'fit', label: 'Fit' }, ...ZOOM_LEVELS.map((z) => ({ value: String(z), label: `${Math.round(z * 100)}%` }))];

const dimension =
  'h-full w-12 min-w-0 bg-transparent text-center text-label-s text-foreground tabular-nums outline-none [appearance:textfield] disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

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
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 text-label-s text-muted-foreground', className)} role="group" aria-label="Screen size">
      <div className="flex items-center gap-2">
        <span aria-hidden>Screen</span>
        <Select items={FRAME_PRESETS} value={value.preset} onValueChange={(next) => next && setPreset(next as FramePreset)}>
          <SelectTrigger size="sm" className="min-w-34 text-label-s" aria-label="Screen">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className="w-auto min-w-52">
            {FRAME_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-label-s">
                <span className="flex-1 pe-4">{p.label}</span>
                {'size' in p ? (
                  <span className="ms-auto text-end text-body-xs text-muted-foreground tabular-nums">
                    {p.size.width} × {p.size.height}
                  </span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        className={cn(
          'flex h-8 items-center rounded-[min(var(--radius-md),10px)] border border-input bg-surface shadow-xs transition-[border-color,box-shadow] duration-150 dark:bg-surface-sunken',
          'hover:border-border-strong focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25 focus-within:hover:border-ring',
          !sizeEditable && 'bg-surface-sunken opacity-70 hover:border-input',
        )}
      >
        <input
          type="number"
          inputMode="numeric"
          className={dimension}
          min={160}
          max={3840}
          value={size.width}
          disabled={!sizeEditable}
          onChange={(e) => e.target.value && setSize({ width: Number(e.target.value) })}
          aria-label="Screen width"
        />
        <span aria-hidden className="text-muted-foreground/80">
          ×
        </span>
        <input
          type="number"
          inputMode="numeric"
          className={dimension}
          min={160}
          max={4000}
          value={size.height}
          disabled={!sizeEditable}
          onChange={(e) => e.target.value && setSize({ height: Number(e.target.value) })}
          aria-label="Screen height"
        />
        <span aria-hidden className="h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon-xs"
          className="mx-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Rotate screen"
          disabled={!sizeEditable}
          onClick={() => setSize({ width: size.height, height: size.width })}
        >
          <ArrowLeftRight />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden>Zoom</span>
        <Select
          items={ZOOM_ITEMS}
          value={String(value.zoom)}
          onValueChange={(next) => next && onChange({ ...value, zoom: next === 'fit' ? 'fit' : Number(next) })}
        >
          <SelectTrigger size="sm" className="min-w-22 text-label-s tabular-nums" aria-label="Zoom">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className="min-w-28">
            {ZOOM_ITEMS.map((z) => (
              <SelectItem key={z.value} value={z.value} className="text-label-s tabular-nums">
                {z.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
