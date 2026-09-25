'use client';

import { Camera, CircleAlert, Clock, Download, ExternalLink, FileText, Film, ListOrdered, Maximize2, Paperclip, Route, Terminal } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../../patterns/empty-state';
import { StatusBadge } from '../../patterns/status-badge';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/tabs';
import { formatBytes, formatDuration } from '../../lib/format';
import { cn } from '../../lib/cn';
import { stripAnsi } from '../../lib/ansi';

export interface AttachmentView {
  id: string;
  name: string;
  contentType: string;
  kind: string;
  status: string;
  sizeBytes: number | null;
  url: string;
  traceUrl?: string;
  /** Inline text content for small text attachments (read server-side). */
  text?: string;
  /** Set once `status` is `expired`: when the retention policy deleted the bytes. */
  expiredAt?: string | null;
  /** When the retention policy will delete the bytes; absent while nothing expires. */
  expiresAt?: string | null;
}

export interface AttemptView {
  id: string;
  retry: number;
  status: string;
  durationMs: number;
  workerIndex: number;
  startedAt: string;
  errors: { message?: string; stack?: string; snippet?: string; location?: { file: string; line: number; column: number } }[];
  steps: { title: string; category: string; durationMs: number; depth: number; error?: string }[];
  stdout: string;
  stderr: string;
  attachments: AttachmentView[];
}

const failed = (s: string) => s === 'failed' || s === 'timedOut' || s === 'interrupted';

export function ResultAttempts({ attempts }: { attempts: AttemptView[] }) {
  return (
    <div className="flex flex-col gap-4">
      {attempts.map((a) => (
        <AttemptCard key={a.id} attempt={a} />
      ))}
    </div>
  );
}

function AttemptCard({ attempt }: { attempt: AttemptView }) {
  const images = attempt.attachments.filter((x) => x.kind === 'screenshot' || x.kind === 'image');
  const videos = attempt.attachments.filter((x) => x.kind === 'video');
  const traces = attempt.attachments.filter((x) => x.kind === 'trace');
  const hasConsole = attempt.stdout.trim().length > 0 || attempt.stderr.trim().length > 0;
  const [tab, setTab] = useState<string>(failed(attempt.status) && attempt.errors.length ? 'error' : 'steps');
  const count = (n: number) => (n ? ` (${n})` : '');

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-e1">
      {/* No rule under the header: the tab strip below carries its own, and two
          hairlines 40px apart read as a seam rather than as structure. */}
      <header className="flex flex-wrap items-center gap-3 px-4 pt-3.5 pb-3">
        <span className="text-sm font-semibold">{attempt.retry === 0 ? 'Run' : `Retry ${attempt.retry}`}</span>
        <StatusBadge status={attempt.status} />
        <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(attempt.durationMs)}</span>
        <span className="text-xs text-muted-foreground">worker {attempt.workerIndex}</span>
        <span className="ml-auto text-xs text-muted-foreground">{new Date(attempt.startedAt).toLocaleTimeString()}</span>
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-0">
        {/* The trigger carries 12px of its own padding, so the strip adds 4 —
            putting the first label's text on the header's 16px margin. */}
        <TabsList variant="line" className="overflow-x-auto px-1">
          <TabsTrigger value="error">
            <CircleAlert aria-hidden />
            Error{count(attempt.errors.length)}
          </TabsTrigger>
          <TabsTrigger value="steps">
            <ListOrdered aria-hidden />
            Steps{count(attempt.steps.length)}
          </TabsTrigger>
          <TabsTrigger value="screenshots">
            <Camera aria-hidden />
            Screenshots{count(images.length)}
          </TabsTrigger>
          <TabsTrigger value="video">
            <Film aria-hidden />
            Video{count(videos.length)}
          </TabsTrigger>
          <TabsTrigger value="trace">
            <Route aria-hidden />
            Trace{count(traces.length)}
          </TabsTrigger>
          <TabsTrigger value="console">
            <Terminal aria-hidden />
            Console
          </TabsTrigger>
          <TabsTrigger value="attachments">
            <Paperclip aria-hidden />
            Attachments{count(attempt.attachments.length)}
          </TabsTrigger>
        </TabsList>
        <div className="p-4">
          <TabsContent value="error">
            {attempt.errors.length === 0 ? (
              <EmptyState title="No errors" className="py-8" />
            ) : (
              <div className="flex flex-col gap-4">
                {attempt.errors.map((e, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <pre tabIndex={0} className="overflow-x-auto rounded-md border bg-danger-solid/5 p-3 text-code-s text-danger-text whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      {stripAnsi(e.message) || 'Unknown error'}
                    </pre>
                    {e.location ? (
                      <p className="text-code-s text-muted-foreground">
                        {e.location.file}:{e.location.line}:{e.location.column}
                      </p>
                    ) : null}
                    {e.snippet ? (
                      <pre tabIndex={0} className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-code-s focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{stripAnsi(e.snippet)}</pre>
                    ) : null}
                    {e.stack ? (
                      <Collapsible>
                        <CollapsibleTrigger className="text-xs text-muted-foreground underline-offset-2 hover:underline">Stack trace</CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre tabIndex={0} className="mt-2 overflow-x-auto rounded-md border bg-muted/40 p-3 text-code-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                            {stripAnsi(e.stack)}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="steps">
            {attempt.steps.length === 0 ? (
              <EmptyState title="No steps recorded" className="py-8" />
            ) : (
              <ol className="flex flex-col divide-y text-sm">
                {attempt.steps.map((s, i) => (
                  <li key={i} className={cn('flex items-center gap-2 py-1.5', s.error && 'text-danger-text')} style={{ paddingLeft: `${s.depth * 16}px` }}>
                    <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-label-xs font-normal text-muted-foreground">
                      {s.category}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-code-s" title={s.title}>
                      {s.title}
                    </span>
                    {s.error ? <span className="hidden max-w-xs truncate text-xs md:inline" title={stripAnsi(s.error)}>{stripAnsi(s.error)}</span> : null}
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDuration(s.durationMs)}</span>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
          <TabsContent value="screenshots">
            <Screenshots images={images} />
          </TabsContent>
          <TabsContent value="video">
            {videos.length === 0 ? (
              <EmptyState icon={Film} title="No video" description="Enable video: 'retain-on-failure' in your Playwright config." className="py-8" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {videos.map((v) => (
                  <figure key={v.id} className="flex flex-col gap-1">
                    {v.status === 'uploaded' ? (
                      <video controls preload="metadata" src={v.url} className="max-w-full rounded-md border bg-black" />
                    ) : v.status === 'expired' ? (
                      <ExpiredPlaceholder a={v} />
                    ) : (
                      <Pending />
                    )}
                    <figcaption className="text-xs text-muted-foreground">
                      {v.name} · {formatBytes(v.sizeBytes)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="trace">
            <TracePanel traces={traces} />
          </TabsContent>
          <TabsContent value="console">
            {!hasConsole ? (
              <EmptyState icon={FileText} title="No console output" className="py-8" />
            ) : (
              <div className="flex flex-col gap-3">
                {attempt.stdout.trim() ? <ConsoleBlock label="stdout" text={attempt.stdout} /> : null}
                {attempt.stderr.trim() ? <ConsoleBlock label="stderr" text={attempt.stderr} tone="error" /> : null}
              </div>
            )}
          </TabsContent>
          <TabsContent value="attachments">
            {attempt.attachments.length === 0 ? (
              <EmptyState icon={Paperclip} title="No attachments" className="py-8" />
            ) : (
              <ul className="flex flex-col divide-y rounded-md border">
                {attempt.attachments.map((a) => (
                  <li key={a.id} className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <KindIcon kind={a.kind} />
                      <span className="font-medium">{a.name}</span>
                      <Badge variant="outline" className="text-label-xs">
                        {a.kind}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {a.contentType} · {formatBytes(a.sizeBytes)}
                        {a.status === 'uploaded' && a.expiresAt ? <> · kept until {formatDay(a.expiresAt)}</> : null}
                      </span>
                      <div className="ml-auto flex gap-1">
                        {a.status === 'expired' ? (
                          <Expired a={a} />
                        ) : a.status === 'uploaded' ? (
                          <>
                            <Button size="xs" variant="ghost" nativeButton={false} render={<a href={a.url} target="_blank" rel="noreferrer" />}>
                              <ExternalLink className="size-3" /> Open
                            </Button>
                            <Button size="xs" variant="ghost" nativeButton={false} render={<a href={`${a.url}?download`} />}>
                              <Download className="size-3" /> Download
                            </Button>
                          </>
                        ) : (
                          <Pending />
                        )}
                      </div>
                    </div>
                    {a.text !== undefined ? (
                      <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-code-s whitespace-pre-wrap">{a.text}</pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

/**
 * Each trace in the Trace Viewer the app serves itself, embedded, with a way
 * out to a full tab and to the zip. The viewer loads the trace from this server
 * in the browser; nothing reaches a third party.
 */
function TracePanel({ traces }: { traces: AttachmentView[] }) {
  if (traces.length === 0) {
    return <EmptyState icon={Route} title="No trace" description="Enable trace: 'retain-on-failure' in your Playwright config." className="py-8" />;
  }
  return (
    <div className="flex flex-col gap-4">
      {traces.map((t) => (
        <div key={t.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Route className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-sm">{t.name}</span>
            <span className="text-xs text-muted-foreground">{formatBytes(t.sizeBytes)}</span>
            <div className="ml-auto flex gap-2">
              {t.status === 'expired' ? (
                <Expired a={t} />
              ) : (
                <>
                  {t.status === 'uploaded' && t.traceUrl ? (
                    <Button size="sm" variant="outline" nativeButton={false} render={<a href={t.traceUrl} target="_blank" rel="noreferrer" />}>
                      <Maximize2 className="size-3.5" /> Open full screen
                    </Button>
                  ) : (
                    <Pending />
                  )}
                  <Button size="sm" variant="outline" nativeButton={false} render={<a href={`${t.url}?download`} />}>
                    <Download className="size-3.5" /> Download
                  </Button>
                </>
              )}
            </div>
          </div>
          {t.status === 'uploaded' && t.traceUrl ? (
            <iframe
              src={t.traceUrl}
              title={`Trace Viewer: ${t.name}`}
              loading="lazy"
              className="h-[75vh] min-h-120 w-full rounded-md border bg-background"
            />
          ) : null}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        The Trace Viewer runs inside this app: your browser loads the trace from this server, and it never reaches a third party.
      </p>
    </div>
  );
}

/** A day, fixed to UTC: this renders on the server and again in the browser, and both must agree. */
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en', { dateStyle: 'medium', timeZone: 'UTC' });
}

/** Why an old run's artifact has no link: the retention policy deleted it. */
function expiredTitle(a: AttachmentView) {
  return a.expiredAt ? `Deleted by the retention policy on ${formatDay(a.expiredAt)}` : 'Deleted by the retention policy';
}

function Expired({ a }: { a: AttachmentView }) {
  return (
    <Badge variant="outline" className="text-muted-foreground" title={expiredTitle(a)}>
      <Clock aria-hidden />
      expired
    </Badge>
  );
}

/** Stands in for media that can no longer be shown, keeping the grid's shape. */
function ExpiredPlaceholder({ a }: { a: AttachmentView }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
      <Clock className="size-4" aria-hidden />
      <span className="font-medium">Expired</span>
      <span>{expiredTitle(a)}.</span>
    </div>
  );
}

function Pending() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      uploading…
    </Badge>
  );
}

function KindIcon({ kind }: { kind: string }) {
  const Icon = kind === 'screenshot' || kind === 'image' ? Camera : kind === 'video' ? Film : kind === 'trace' ? Route : kind === 'text' ? FileText : Paperclip;
  return <Icon className="size-4 text-muted-foreground" />;
}

function ConsoleBlock({ label, text, tone }: { label: string; text: string; tone?: 'error' }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre className={cn('max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-code-s whitespace-pre-wrap', tone === 'error' && 'text-danger-text')}>
        {stripAnsi(text)}
      </pre>
    </div>
  );
}

/** Groups Playwright's `<name>-expected/-actual/-diff` screenshots into a visual comparison. */
function Screenshots({ images }: { images: AttachmentView[] }) {
  if (images.length === 0) {
    return <EmptyState icon={Camera} title="No screenshots" description="Enable screenshot: 'only-on-failure' in your Playwright config." className="py-8" />;
  }
  const groups = new Map<string, Partial<Record<'expected' | 'actual' | 'diff', AttachmentView>>>();
  const singles: AttachmentView[] = [];
  for (const img of images) {
    const m = /^(.*)-(expected|actual|diff)(\.[a-z]+)?$/i.exec(img.name);
    if (m) {
      const g = groups.get(m[1]) ?? {};
      g[m[2].toLowerCase() as 'expected' | 'actual' | 'diff'] = img;
      groups.set(m[1], g);
    } else singles.push(img);
  }
  return (
    <div className="flex flex-col gap-6">
      {[...groups.entries()].map(([name, g]) => (
        <div key={name}>
          <p className="mb-2 text-sm font-medium">
            Visual comparison <span className="text-code-s text-muted-foreground">{name}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {(['expected', 'actual', 'diff'] as const).map((k) => (
              <figure key={k} className="flex flex-col gap-1">
                <figcaption className="text-xs font-medium capitalize text-muted-foreground">{k}</figcaption>
                {g[k] ? <Img a={g[k]!} /> : <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">missing</div>}
              </figure>
            ))}
          </div>
        </div>
      ))}
      {singles.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {singles.map((img) => (
            <figure key={img.id} className="flex flex-col gap-1">
              <Img a={img} />
              <figcaption className="text-xs text-muted-foreground">
                {img.name} · {formatBytes(img.sizeBytes)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Img({ a }: { a: AttachmentView }) {
  if (a.status === 'expired') return <ExpiredPlaceholder a={a} />;
  if (a.status !== 'uploaded') return <Pending />;
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.url} alt={a.name} className="max-w-full rounded-md border bg-muted/30" loading="lazy" />
    </a>
  );
}
