'use client';

import { AlertTriangle, EyeOff, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Switch } from '../../components/switch';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import type { DiffRegion, FrameSize, ReviewImage } from '../../lib/review';
import { IGNORE_CATEGORY_LABELS, ruleValidity, type IgnorePreviewView, type IgnoreRule, type IgnoreRuleInput, type RuleValidity } from '../../lib/visual-diff';
import { DiffMarks } from './diff-summary';
import { UnavailableImage } from './review-frame';
import { liveHeight, liveWidth } from './screen-frame';

export type IgnoreRect = Pick<DiffRegion, 'x' | 'y' | 'width' | 'height'>;

/** What the editor hands back: the whole set after the change, why, and the revision it started from. */
export interface IgnoreRulesChange {
  captureId: string;
  rules: IgnoreRuleInput[];
  reason?: string | null;
  expectedRevision: number;
}

/** A draft rule in the editor: an existing one (with its id) or a rectangle just drawn. */
type Draft = IgnoreRuleInput & { key: string; existing: IgnoreRule | null };

/** Smaller than this (image pixels) is a click, not a rectangle. */
const MIN_SIDE = 4;
export const MAX_IGNORE_REGIONS = 20;

const VALIDITY_TEXT: Record<RuleValidity, string | null> = {
  valid: null,
  legacy: 'Saved before rules recorded the image they were drawn on: applied unchecked.',
  geometry_changed: 'Drawn on an image of another size: not applied to this one until a person checks it.',
  out_of_bounds: 'Lies outside this image: not applied.',
  inactive: 'Switched off.',
};

/** The rules being edited, shared by the canvas on the stage and the panel beside it. */
export interface IgnoreDrafts {
  drafts: Draft[];
  active: Draft[];
  activeRects: IgnoreRect[];
  full: boolean;
  changed: boolean;
  maxRules: number;
  /** Names the hint in the panel, which describes the canvas. */
  helpId: string;
  add: (rect: IgnoreRect) => void;
  update: (key: string, patch: Partial<Draft>) => void;
  remove: (key: string) => void;
}

/**
 * The draft of a checkpoint's rules while `open`: the saved ones (and any `prefill`) again each time it opens, and
 * when the saved set changes. While open, the host is asked (debounced) what the active rectangles would leave out.
 */
export function useIgnoreDrafts({
  open = true,
  rules,
  prefill,
  onPreview,
  maxRules = MAX_IGNORE_REGIONS,
}: {
  open?: boolean;
  rules: readonly IgnoreRule[];
  prefill?: readonly IgnoreRect[] | null;
  onPreview?: (rects: IgnoreRect[]) => void;
  maxRules?: number;
}): IgnoreDrafts {
  const initial = (): Draft[] => [...fromRules(rules), ...(prefill ?? []).map((r, i) => ({ key: `prefill-${i}`, ...r, id: null, reason: 'Proposed by an AI analysis', category: null, active: true, existing: null }))];
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const helpId = useId();
  // By value: a host passing a fresh empty list each render must not reset what is being drawn.
  const rulesKey = JSON.stringify(rules);
  const prefillKey = JSON.stringify(prefill ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setDrafts(initial()); }, [open, rulesKey, prefillKey]);

  const active = drafts.filter((d) => d.active !== false);
  const activeRects = active.map(({ x, y, width, height }) => ({ x, y, width, height }));
  const rectsKey = JSON.stringify(activeRects);
  // The preview follows the active rectangles, a moment after the last change.
  useEffect(() => {
    if (!onPreview || !open) return;
    const timer = setTimeout(() => onPreview(JSON.parse(rectsKey) as IgnoreRect[]), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rectsKey, open]);

  return {
    drafts,
    active,
    activeRects,
    full: drafts.length >= maxRules,
    changed: JSON.stringify(drafts.map(strip)) !== JSON.stringify(fromRules(rules).map(strip)),
    maxRules,
    helpId,
    add: (r) => setDrafts((list) => [...list, { key: `new-${Date.now()}-${list.length}`, ...r, id: null, reason: null, category: null, active: true, existing: null }]),
    update: (key, patch) => setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d))),
    remove: (key) => setDrafts((list) => list.filter((d) => d.key !== key)),
  };
}

function fromRules(list: readonly IgnoreRule[]): Draft[] {
  return list.map((r) => ({ key: r.id, id: r.id, x: r.x, y: r.y, width: r.width, height: r.height, reason: r.reason, category: r.category, active: r.active, existing: r }));
}

/**
 * The image to draw on, and nothing else: drag to leave an area out. It belongs on the stage; what the areas are for,
 * and saving them, is `IgnoreRegionsPanel`'s, beside it. Coordinates are the image's own pixels, whatever the zoom.
 */
export function IgnoreRegionsCanvas({
  drafts,
  image,
  imageSize,
  frame,
  zoom,
  alt,
  live = false,
  room = false,
}: {
  drafts: IgnoreDrafts;
  image: ReviewImage;
  imageSize: { width: number; height: number };
  frame: FrameSize;
  zoom: number;
  alt: string;
  /** Sized by CSS from the viewer's stage (`SCREEN_ZOOM_VAR`), `zoom` otherwise; see `ScreenFrame`. */
  live?: boolean;
  /** Live, as tall as the room the stage gives it, whatever the zoom. */
  room?: boolean;
}) {
  const [drawing, setDrawing] = useState<IgnoreRect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const { full, activeRects } = drafts;

  const width = Math.max(24, Math.round(frame.width * zoom));
  const height = Math.max(24, Math.round(frame.height * zoom));
  const toImage = (e: React.PointerEvent) => {
    const box = surface.current!.getBoundingClientRect();
    const x = Math.min(imageSize.width, Math.max(0, ((e.clientX - box.left) / box.width) * imageSize.width));
    const y = Math.min(imageSize.height, Math.max(0, ((e.clientY - box.top) / box.height) * imageSize.height));
    return { x, y };
  };
  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): IgnoreRect => ({
    x: Math.round(Math.min(a.x, b.x)),
    y: Math.round(Math.min(a.y, b.y)),
    width: Math.round(Math.abs(a.x - b.x)),
    height: Math.round(Math.abs(a.y - b.y)),
  });

  return (
    <div
      role="region"
      aria-label={`${alt}, areas left out`}
      aria-describedby={drafts.helpId}
      tabIndex={0}
      className="relative mx-auto shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md bg-surface shadow-e1 ring-1 ring-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      style={live ? { width: liveWidth(frame.width, zoom), height: liveHeight(frame.height, zoom, room) } : { width, height }}
    >
      {image.available ? (
        <div
          ref={surface}
          className={cn('relative touch-none select-none', full ? 'cursor-not-allowed' : 'cursor-crosshair')}
          onPointerDown={(e) => {
            if (full || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = toImage(e);
            setDrawing(null);
          }}
          onPointerMove={(e) => start.current && setDrawing(rectFrom(start.current, toImage(e)))}
          onPointerUp={(e) => {
            if (!start.current) return;
            const r = rectFrom(start.current, toImage(e));
            start.current = null;
            setDrawing(null);
            if (r.width >= MIN_SIDE && r.height >= MIN_SIDE) drafts.add(r);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={alt} draggable={false} className="block h-auto w-full" />
          <DiffMarks regions={drawing ? [...activeRects, drawing] : activeRects} width={imageSize.width} height={imageSize.height} kind="ignore" />
        </div>
      ) : (
        <UnavailableImage image={image} />
      )}
    </div>
  );
}

/**
 * What the areas drawn on `IgnoreRegionsCanvas` are for, in the side panel: how to draw one, what the active ones
 * would leave out (`preview`, so a rectangle that swallows a price next to a name shows up before it is saved), and
 * each rule with its reason, who drew it on which image and whether it still fits this one; a switch keeps a rule
 * but turns it off. Saving measures the checkpoint's images again without the active areas.
 */
export function IgnoreRegionsPanel({
  drafts: state,
  captureId,
  imageSize,
  revision,
  onSave,
  onCancel,
  preview,
  pending = false,
}: {
  drafts: IgnoreDrafts;
  captureId: string;
  imageSize: { width: number; height: number };
  /** The revision of the saved set, handed back so a save can refuse a stale one. */
  revision: number;
  onSave: (change: IgnoreRulesChange) => void;
  onCancel: () => void;
  /** The host's answer to the last preview asked for. */
  preview?: IgnorePreview | null;
  pending?: boolean;
}) {
  const [reason, setReason] = useState('');
  const { drafts, active, full, changed, maxRules, update, remove } = state;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${state.helpId}-title`}>
      <div className="flex flex-col gap-1">
        <h3 id={`${state.helpId}-title`} className="flex items-center gap-1.5 text-label-m">
          <EyeOff aria-hidden className="size-3.5 text-muted-foreground" /> Leave out areas
        </h3>
        <p className="text-xs text-muted-foreground text-pretty" id={state.helpId}>
          {full ? `At most ${maxRules} areas.` : 'Drag on the image to leave an area out of the comparison. Keep it tight: the text that changes, not the row it sits in.'}
        </p>
      </div>
      <PreviewLine preview={preview} active={active.length} />
      {drafts.length ? (
        <ol className="flex flex-col gap-1.5 text-sm" aria-label="Areas left out">
          {drafts.map((d, i) => {
            const validity = d.existing ? ruleValidity({ ...d.existing, active: d.active !== false }, imageSize) : null;
            const warn = validity && validity !== 'valid' && validity !== 'inactive' ? VALIDITY_TEXT[validity] : null;
            return (
              <li key={d.key} className={cn('flex flex-col gap-1.5 rounded-md bg-surface-sunken px-2.5 py-2', d.active === false && 'border border-dashed border-border')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface text-label-xs text-muted-foreground tabular-nums ring-1 ring-border">{i + 1}</span>
                    <span className="tabular-nums">
                      {d.width} × {d.height} px at {d.x}, {d.y}
                    </span>
                    {d.existing?.source === 'ai_suggestion' ? (
                      <span className="inline-flex items-center gap-1 text-label-xs text-muted-foreground" title="Accepted from an AI suggestion">
                        <Sparkles aria-hidden className="size-3" /> AI
                      </span>
                    ) : null}
                    {d.existing?.source === 'legacy' ? <span className="text-label-xs text-muted-foreground">legacy</span> : null}
                    {d.active === false ? <span className="rounded bg-surface px-1 text-label-xs text-muted-foreground ring-1 ring-border">off</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Switch size="sm" checked={d.active !== false} onCheckedChange={(on) => update(d.key, { active: on })} aria-label={`Area ${i + 1} switched on`} />
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove area ${i + 1}`} onClick={() => remove(d.key)}>
                      <Trash2 />
                    </Button>
                  </span>
                </div>
                <Input value={d.reason ?? ''} onChange={(e) => update(d.key, { reason: e.target.value || null })} placeholder="Why is this area left out? (a clock, a random name…)" aria-label={`Reason for area ${i + 1}`} className="h-7 text-xs" maxLength={500} />
                {d.existing ? (
                  <p className="text-label-xs text-muted-foreground">
                    {d.existing.createdBy ? `${d.existing.createdBy}, ` : ''}
                    {formatDateTime(d.existing.createdAt)}
                    {d.existing.geometry ? ` · drawn on a ${d.existing.geometry.imageWidth} × ${d.existing.geometry.imageHeight} image` : ''}
                    {d.existing.category ? ` · ${IGNORE_CATEGORY_LABELS[d.existing.category]}` : ''}
                  </p>
                ) : null}
                {warn ? (
                  <p className="flex items-start gap-1.5 text-label-xs text-warning-text">
                    <AlertTriangle aria-hidden className="mt-px size-3 shrink-0" /> {warn}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing is left out yet.</p>
      )}
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this change? (kept in the history)" aria-label="Reason for this change" className="h-8" maxLength={500} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!changed || pending} onClick={() => onSave({ captureId, rules: drafts.map(strip), reason: reason || null, expectedRevision: revision })}>
          {pending ? 'Saving…' : 'Save and measure again'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto text-label-xs text-muted-foreground tabular-nums">Revision {revision}</span>
      </div>
    </section>
  );
}

type IgnorePreview = { pending: boolean; result: IgnorePreviewView | null; error?: string | null };

/**
 * The canvas and its panel side by side, on their own: what `CheckpointViewer` puts on its stage and in its side
 * panel. While you draw, the host measures what the rectangles would leave out (`onPreview`).
 */
export function IgnoreRegionsEditor({
  rules,
  prefill,
  onPreview,
  maxRules,
  preview,
  captureId,
  revision,
  onSave,
  onCancel,
  pending,
  ...canvas
}: Omit<React.ComponentProps<typeof IgnoreRegionsCanvas>, 'drafts'> &
  Omit<React.ComponentProps<typeof IgnoreRegionsPanel>, 'drafts'> & {
    /** The checkpoint's rules as saved. */
    rules: readonly IgnoreRule[];
    /** Rectangles drawn in as new rules when the editor opens (a suggestion to adjust). */
    prefill?: readonly IgnoreRect[] | null;
    /** Asked (debounced) with the active rectangles whenever they change, when the host can measure. */
    onPreview?: (rects: IgnoreRect[]) => void;
    maxRules?: number;
  }) {
  const drafts = useIgnoreDrafts({ rules, prefill, onPreview, maxRules });
  return (
    <div className="flex flex-wrap items-start gap-6">
      <IgnoreRegionsCanvas drafts={drafts} {...canvas} />
      <div className="w-80 max-w-full">
        <IgnoreRegionsPanel drafts={drafts} captureId={captureId} imageSize={canvas.imageSize} revision={revision} onSave={onSave} onCancel={onCancel} preview={preview} pending={pending} />
      </div>
    </div>
  );
}

function strip(d: Draft): IgnoreRuleInput {
  return { id: d.id ?? null, x: d.x, y: d.y, width: d.width, height: d.height, reason: d.reason ?? null, category: d.category ?? null, active: d.active !== false };
}

/** What the active rectangles would do to the comparison: raw · left out · remaining. */
function PreviewLine({ preview, active }: { preview?: IgnorePreview | null; active: number }) {
  if (!preview) return null;
  if (preview.error) return <p className="text-xs text-warning-text">{preview.error}</p>;
  if (preview.pending && !preview.result) return <p className="text-xs text-muted-foreground" role="status">Measuring what these areas would leave out…</p>;
  const r = preview.result;
  if (!r) return null;
  const wide = r.ignoredAreaPercent > 10;
  return (
    <p className={cn('flex items-start gap-1.5 text-xs', preview.pending && 'opacity-70')} role="status" aria-live="polite">
      <EyeOff aria-hidden className="mt-px size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex flex-col gap-0.5">
        <span className="tabular-nums">
          {r.rawChangedPixels.toLocaleString('en')} changed · {r.suppressedPixels.toLocaleString('en')} left out · <strong>{r.remainingPixels.toLocaleString('en')} remaining</strong>
          {r.remainingRegions ? ` in ${r.remainingRegions} ${r.remainingRegions === 1 ? 'region' : 'regions'}` : ''}
        </span>
        {active ? <span className={cn('text-muted-foreground', wide && 'text-warning-text')}>{r.ignoredAreaPercent}% of the image{wide ? ' — a lot: the comparison is no longer exact' : ''}</span> : null}
        {r.sizeChanged ? <span className="text-warning-text">The images differ in size; no area leaves that out.</span> : null}
      </span>
    </p>
  );
}
