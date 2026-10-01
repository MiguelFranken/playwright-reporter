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

/**
 * Areas of a checkpoint's image to leave out of its comparisons — a clock, a
 * carousel, a generated name — as rules with a reason. Drag on the image to
 * draw one; the list below says what each is for, who drew it on which image,
 * and whether it still fits this one; a switch keeps a rule but turns it off.
 * While you draw, the host measures what the rectangles would leave out
 * (`preview`), so a rectangle that swallows a price next to a name shows up
 * before it is saved. Saving measures the checkpoint's images again without
 * the active areas. Coordinates are the image's own pixels, whatever the zoom.
 */
export function IgnoreRegionsEditor({
  captureId,
  image,
  imageSize,
  frame,
  zoom,
  alt,
  rules,
  revision,
  onSave,
  onCancel,
  onPreview,
  preview,
  pending = false,
  maxRules = MAX_IGNORE_REGIONS,
  prefill,
}: {
  captureId: string;
  image: ReviewImage;
  imageSize: { width: number; height: number };
  frame: FrameSize;
  zoom: number;
  alt: string;
  /** The checkpoint's rules as saved. */
  rules: readonly IgnoreRule[];
  /** The revision of the saved set, handed back so a save can refuse a stale one. */
  revision: number;
  onSave: (change: IgnoreRulesChange) => void;
  onCancel: () => void;
  /** Asked (debounced) with the active rectangles whenever they change, when the host can measure. */
  onPreview?: (rects: IgnoreRect[]) => void;
  /** The host's answer to the last `onPreview`. */
  preview?: { pending: boolean; result: IgnorePreviewView | null; error?: string | null } | null;
  pending?: boolean;
  maxRules?: number;
  /** Rectangles drawn in as new rules when the editor opens (a suggestion to adjust). */
  prefill?: readonly IgnoreRect[] | null;
}) {
  const fromRules = (list: readonly IgnoreRule[]): Draft[] => list.map((r) => ({ key: r.id, id: r.id, x: r.x, y: r.y, width: r.width, height: r.height, reason: r.reason, category: r.category, active: r.active, existing: r }));
  const withPrefill = (list: Draft[]): Draft[] => [...list, ...(prefill ?? []).map((r, i) => ({ key: `prefill-${i}`, ...r, id: null, reason: 'Proposed by an AI analysis', category: null, active: true, existing: null }))];
  const [drafts, setDrafts] = useState<Draft[]>(() => withPrefill(fromRules(rules)));
  const [drawing, setDrawing] = useState<IgnoreRect | null>(null);
  const [reason, setReason] = useState('');
  const start = useRef<{ x: number; y: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const helpId = useId();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDrafts(withPrefill(fromRules(rules))), [rules, prefill]);

  const active = drafts.filter((d) => d.active !== false);
  const activeRects = active.map(({ x, y, width, height }) => ({ x, y, width, height }));
  const rectsKey = JSON.stringify(activeRects);
  // The preview follows the active rectangles, a moment after the last change.
  useEffect(() => {
    if (!onPreview) return;
    const timer = setTimeout(() => onPreview(JSON.parse(rectsKey) as IgnoreRect[]), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rectsKey]);

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
  const full = drafts.length >= maxRules;
  const saved = JSON.stringify(fromRules(rules).map(strip));
  const changed = JSON.stringify(drafts.map(strip)) !== saved;
  const update = (key: string, patch: Partial<Draft>) => setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-label-s text-muted-foreground" id={helpId}>
        {full ? `At most ${maxRules} areas.` : 'Drag on the image to leave an area out of the comparison. Keep it tight: the text that changes, not the row it sits in.'}
      </p>
      <div
        role="region"
        aria-label={`${alt}, areas left out`}
        aria-describedby={helpId}
        tabIndex={0}
        className="relative shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md bg-surface shadow-e1 ring-1 ring-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        style={{ width, height }}
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
              if (r.width >= MIN_SIDE && r.height >= MIN_SIDE) setDrafts((list) => [...list, { key: `new-${Date.now()}-${list.length}`, ...r, id: null, reason: null, category: null, active: true, existing: null }]);
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
      <div className="flex w-full max-w-xl flex-col gap-3">
        <PreviewLine preview={preview} active={active.length} />
        {drafts.length ? (
          <ol className="flex flex-col gap-1.5 text-sm" aria-label="Areas left out">
            {drafts.map((d, i) => {
              const validity = d.existing ? ruleValidity({ ...d.existing, active: d.active !== false }, imageSize) : null;
              const warn = validity && validity !== 'valid' && validity !== 'inactive' ? VALIDITY_TEXT[validity] : null;
              return (
                <li key={d.key} className={cn('flex flex-col gap-1.5 rounded-md bg-surface-sunken px-2.5 py-2', d.active === false && 'border border-dashed border-border')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-surface text-label-xs text-muted-foreground tabular-nums ring-1 ring-border">{i + 1}</span>
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
                    <span className="flex items-center gap-1">
                      <Switch size="sm" checked={d.active !== false} onCheckedChange={(on) => update(d.key, { active: on })} aria-label={`Area ${i + 1} switched on`} />
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove area ${i + 1}`} onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}>
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
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!changed || pending} onClick={() => onSave({ captureId, rules: drafts.map(strip), reason: reason || null, expectedRevision: revision })}>
            {pending ? 'Saving…' : 'Save and measure again'}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <span className="ml-auto text-label-xs text-muted-foreground tabular-nums">Revision {revision}</span>
        </div>
      </div>
    </div>
  );
}

function strip(d: Draft): IgnoreRuleInput {
  return { id: d.id ?? null, x: d.x, y: d.y, width: d.width, height: d.height, reason: d.reason ?? null, category: d.category ?? null, active: d.active !== false };
}

/** What the active rectangles would do to the comparison: raw · left out · remaining. */
function PreviewLine({ preview, active }: { preview: IgnoreRegionsEditorProps['preview']; active: number }) {
  if (!preview) return null;
  if (preview.error) return <p className="text-xs text-warning-text">{preview.error}</p>;
  if (preview.pending && !preview.result) return <p className="text-xs text-muted-foreground" role="status">Measuring what these areas would leave out…</p>;
  const r = preview.result;
  if (!r) return null;
  const wide = r.ignoredAreaPercent > 10;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 text-xs', preview.pending && 'opacity-70')} role="status" aria-live="polite">
      <EyeOff aria-hidden className="size-3.5 text-muted-foreground" />
      <span className="tabular-nums">
        {r.rawChangedPixels.toLocaleString('en')} changed · {r.suppressedPixels.toLocaleString('en')} left out · <strong>{r.remainingPixels.toLocaleString('en')} remaining</strong>
        {r.remainingRegions ? ` in ${r.remainingRegions} ${r.remainingRegions === 1 ? 'region' : 'regions'}` : ''}
      </span>
      {active ? <span className={cn('text-muted-foreground', wide && 'text-warning-text')}>{r.ignoredAreaPercent}% of the image{wide ? ' — a lot: the comparison is no longer exact' : ''}</span> : null}
      {r.sizeChanged ? <span className="text-warning-text">The images differ in size; no area leaves that out.</span> : null}
    </p>
  );
}

type IgnoreRegionsEditorProps = React.ComponentProps<typeof IgnoreRegionsEditor>;
