'use client';

import { ExternalLink, Film, Info, Keyboard, Route } from 'lucide-react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Kbd } from '../../components/kbd';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../../components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/tooltip';
import type { ReviewCaptureView, ReviewCheckpointView, ReviewFlowView } from '../../lib/review';

export interface CheckpointDetailsProps {
  flow: ReviewFlowView;
  checkpoint: ReviewCheckpointView;
  /** The image on show; with several, the first. */
  capture: ReviewCaptureView | null;
  /** In the library: which run the screen is from, and its approved screen. */
  library?: boolean;
  /** The keys, and what each does, that apply here. */
  shortcuts?: readonly (readonly [readonly string[], string])[];
  /** Open; uncontrolled when absent (the viewer opens it with D). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Seconds into the test, as a video player counts them. */
export function seconds(ms: number) {
  const s = Math.max(0, ms / 1000);
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

/**
 * What a reviewer looks up now and then, not on every screen: where in the
 * test the capture was taken (step, URL, page title, time), its viewport and
 * size, the tags, the video, trace and test result, and the keyboard
 * shortcuts. Behind a button, so deciding and the comments have the panel.
 */
export function CheckpointDetails({ flow, checkpoint, capture, library = false, shortcuts = [], open, onOpenChange }: CheckpointDetailsProps) {
  const videoUrl = checkpoint.origin ? checkpoint.origin.videoUrl : flow.videoUrl;
  return (
    <Popover open={open} onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}>
      <Tooltip>
        <TooltipTrigger render={<PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Details" aria-keyshortcuts="D" />} />}>
          <Info />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Details: step, URL, video, trace <Kbd>D</Kbd>
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="bottom" align="end" className="flex max-h-[min(36rem,80dvh)] w-96 flex-col gap-4 overflow-auto" aria-label="Details">
        <PopoverTitle className="text-label-m">Details</PopoverTitle>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          {library && capture?.runNumber ? (
            <>
              <dt className="text-muted-foreground">Captured in</dt>
              <dd className="tabular-nums">
                Run #{capture.runNumber}
                {capture.baseline ? ` · approved screen from ${capture.baseline.runNumber ? `run #${capture.baseline.runNumber}` : 'an earlier run'}` : ' · nothing approved yet'}
              </dd>
            </>
          ) : null}
          {checkpoint.stepPath.length ? (
            <>
              <dt className="text-muted-foreground">Step</dt>
              <dd className="min-w-0 break-words">{checkpoint.stepPath.join(' › ')}</dd>
            </>
          ) : null}
          {checkpoint.url ? (
            <>
              <dt className="text-muted-foreground">URL</dt>
              <dd className="min-w-0 truncate text-code-s" title={checkpoint.url}>
                {checkpoint.url}
              </dd>
            </>
          ) : null}
          {checkpoint.pageTitle ? (
            <>
              <dt className="text-muted-foreground">Page title</dt>
              <dd className="min-w-0 break-words">{checkpoint.pageTitle}</dd>
            </>
          ) : null}
          {checkpoint.offsetMs != null ? (
            <>
              <dt className="text-muted-foreground">Captured</dt>
              <dd className="tabular-nums">{seconds(checkpoint.offsetMs)} into the test</dd>
            </>
          ) : null}
          {capture?.viewport ? (
            <>
              <dt className="text-muted-foreground">Viewport</dt>
              <dd className="tabular-nums">
                {capture.viewport.width} × {capture.viewport.height}
                {capture.deviceScaleFactor && capture.deviceScaleFactor !== 1 ? ` @${capture.deviceScaleFactor}×` : ''}
                {capture.isMobile ? ' · mobile' : ''}
              </dd>
            </>
          ) : null}
          {capture?.image.width && capture.image.height ? (
            <>
              <dt className="text-muted-foreground">Image</dt>
              <dd className="tabular-nums">
                {capture.image.width} × {capture.image.height} px{capture.fullPage === false ? ' · viewport only' : capture.fullPage ? ' · full page' : ''}
              </dd>
            </>
          ) : null}
          {checkpoint.tags.length ? (
            <>
              <dt className="text-muted-foreground">Tags</dt>
              <dd className="flex flex-wrap gap-1">
                {checkpoint.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-label-xs">
                    {t}
                  </Badge>
                ))}
              </dd>
            </>
          ) : null}
        </dl>

        <nav className="flex flex-col gap-1" aria-label="Evidence">
          {videoUrl ? (
            <a className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline" href={`${videoUrl}${checkpoint.offsetMs != null ? `#t=${(checkpoint.offsetMs / 1000).toFixed(1)}` : ''}`} target="_blank" rel="noreferrer">
              <Film className="size-4" /> Watch the video{checkpoint.offsetMs != null ? ` at ${seconds(checkpoint.offsetMs)}` : ''}
            </a>
          ) : null}
          {flow.traceUrl ? (
            <a className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline" href={flow.traceUrl} target="_blank" rel="noreferrer">
              <Route className="size-4" /> Open the trace
            </a>
          ) : null}
          <a className="inline-flex items-center gap-2 text-sm text-accent-text hover:underline" href={checkpoint.origin?.resultHref ?? flow.resultHref}>
            <ExternalLink className="size-4" /> Test result
          </a>
        </nav>

        {shortcuts.length ? (
          <details className="border-t border-border pt-3 text-xs text-muted-foreground">
            <summary className="inline-flex cursor-pointer items-center gap-1.5">
              <Keyboard className="size-3.5" /> Keyboard shortcuts
            </summary>
            <ul className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {shortcuts.map(([keys, what]) => (
                <li key={what} className="contents">
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                  <span>{what}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
