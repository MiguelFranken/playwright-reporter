import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { BackLink } from '@miguelfranken/ui/patterns/back-link';
import { HistorySparkline } from '@miguelfranken/ui/patterns/history-sparkline';
import { collapseWs, stripAnsi } from '@miguelfranken/ui/lib/ansi';
import { ResultAttempts, type AttachmentView, type AttemptView } from '@miguelfranken/ui/views/run/result-attempts';
import { StatusBadge } from '@miguelfranken/ui/patterns/status-badge';
import { DebugWithAiMenu } from '@miguelfranken/ui/patterns/debug-with-ai-menu';
import { debugPrompt } from '@miguelfranken/ui/lib/ai-handoff';
import { Alert, AlertDescription, AlertTitle } from '@miguelfranken/ui/components/alert';
import { Badge } from '@miguelfranken/ui/components/badge';
import { Button } from '@miguelfranken/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@miguelfranken/ui/components/table';
import { requireProject } from '@/lib/auth/access';
import { getResultDetail, testHistory } from '@/lib/db/queries/runs';
import { formatDateTime, formatDuration, formatRelative } from '@miguelfranken/ui/lib/format';
import { signArtifactPath } from '@/lib/auth/artifact-url';
import { projectHrefs } from '@/lib/view-models';
import { baseUrl, getStorage } from '@/lib/storage';
import { expiresAt, getRetentionPolicy } from '@/lib/storage/retention';

type Props = { params: Promise<{ team: string; project: string; number: string; resultId: string }> };

export default function ResultPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ResultContent {...props} />
    </Suspense>
  );
}

const MAX_INLINE_TEXT = 200 * 1024;

/** Outcomes the "Debug with AI" menu is offered for: every kind of failure, and flaky passes. */
const AI_DEBUG_OUTCOMES = new Set<string>(['failed', 'timedout', 'interrupted', 'flaky']);

async function readText(storageKey: string, size: number | null) {
  if (size !== null && size > MAX_INLINE_TEXT) return undefined;
  try {
    const obj = await getStorage().get(storageKey);
    if (!obj || obj.size > MAX_INLINE_TEXT) return undefined;
    return await new Response(obj.stream).text();
  } catch {
    return undefined;
  }
}

async function ResultContent({ params }: Props) {
  const { team, project: projectSlug, number, resultId } = await params;
  const runNumber = Number(number);
  if (!Number.isInteger(runNumber)) notFound();
  const { project } = await requireProject(team, projectSlug);
  const detail = await getResultDetail(project.id, runNumber, resultId);
  if (!detail) notFound();
  const { result, test, run, attempts, position } = detail;
  const [history, { policy }] = await Promise.all([testHistory(test.id, { limit: 15 }), getRetentionPolicy()]);
  const base = `/teams/${team}/projects/${project.slug}`;
  const origin = baseUrl();

  const views: AttemptView[] = await Promise.all(
    attempts.map(async (a) => ({
      id: a.id,
      retry: a.retry,
      status: a.status,
      durationMs: a.durationMs,
      workerIndex: a.workerIndex,
      startedAt: a.startedAt.toISOString(),
      errors: a.errors,
      steps: a.steps,
      stdout: a.stdout,
      stderr: a.stderr,
      attachments: await Promise.all(
        a.attachments.map(async (att): Promise<AttachmentView> => {
          const url = `/api/artifacts/${att.id}`;
          return {
            id: att.id,
            name: att.name,
            contentType: att.contentType,
            kind: att.kind,
            status: att.status,
            sizeBytes: att.sizeBytes,
            url,
            // The trace viewer fetches cross-site without our cookies, so trace
            // links carry a short-lived signature instead (lib/auth/artifact-url.ts).
            traceUrl:
              att.kind === 'trace'
                ? `https://trace.playwright.dev/?trace=${encodeURIComponent(`${origin}${signArtifactPath(att.id)}`)}`
                : undefined,
            text: att.kind === 'text' && att.status === 'uploaded' ? await readText(att.storageKey, att.sizeBytes) : undefined,
            expiredAt: att.expiredAt?.toISOString() ?? null,
            expiresAt: expiresAt(policy, att.kind, att.createdAt)?.toISOString() ?? null,
          };
        }),
      ),
    })),
  );

  const comparison = compareAttempts(attempts);
  const runHref = `${base}/runs/${run.number}`;
  const resultHref = (id: string) => `${runHref}/tests/${id}`;
  // Only outcomes with something to explain get the hand-off; the prompt is a
  // plain string so it can cross into the client menu (packages/ui AGENTS.md, trap 1).
  const aiPrompt = AI_DEBUG_OUTCOMES.has(result.outcome)
    ? debugPrompt({ resultUrl: `${origin}${projectHrefs(base).result(run.number, result.id)}` })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={runHref}>Run #{run.number}</BackLink>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={result.outcome} />
              <h1 className="min-w-0 truncate text-title-m md:text-title-l" title={test.title}>
                {test.title}
              </h1>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {test.titlePath.length > 1 ? <span className="truncate">{test.titlePath.slice(0, -1).join(' › ')}</span> : null}
              <span className="text-code-s">
                {test.file}:{result.line}
              </span>
              <Badge variant="secondary">{test.pwProject || 'default'}</Badge>
              {result.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-label-xs">
                  {t}
                </Badge>
              ))}
              {result.annotations.map((a, i) => (
                <Badge key={i} variant="outline" className="text-label-xs" title={a.description}>
                  {a.type}
                  {a.description ? `: ${a.description}` : ''}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              Test {position.index + 1} of {position.total}
            </span>
            <Button variant="outline" size="icon-sm" disabled={!position.prevId} aria-label="Previous test" nativeButton={!position.prevId} render={position.prevId ? <Link href={resultHref(position.prevId)} /> : undefined}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon-sm" disabled={!position.nextId} aria-label="Next test" nativeButton={!position.nextId} render={position.nextId ? <Link href={resultHref(position.nextId)} /> : undefined}>
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${base}/tests/${test.id}`} />}>
              <History className="size-3.5" /> History
            </Button>
            {aiPrompt ? <DebugWithAiMenu prompt={aiPrompt} setupHref="/account/ai" /> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Status" value={<StatusBadge status={result.outcome} />} />
        <Kpi label="Attempts" value={attempts.length} sub={attempts.length > 1 ? `${attempts.length - 1} retr${attempts.length - 1 === 1 ? 'y' : 'ies'}` : 'no retries'} />
        <Kpi label="Total runtime" value={formatDuration(result.durationMs)} sub={formatDateTime(result.startedAt)} />
        <Kpi label="Expected status" value={<span className="capitalize">{result.expectedStatus}</span>} sub={`worker ${attempts[0]?.workerIndex ?? '–'}`} />
      </div>

      {comparison ? (
        <Alert>
          <AlertTitle>Attempt comparison</AlertTitle>
          <AlertDescription>{comparison}</AlertDescription>
        </Alert>
      ) : null}

      {views.length === 0 ? (
        <Alert>
          <AlertTitle>No attempts recorded yet</AlertTitle>
          <AlertDescription>The test has started but no attempt has finished.</AlertDescription>
        </Alert>
      ) : (
        <ResultAttempts attempts={views} />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">History</CardTitle>
          <HistorySparkline history={history.map((h) => h.outcome)} cells={15} />
        </CardHeader>
        <CardContent flush className="overflow-x-auto py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Retries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.resultId} className={h.resultId === result.id ? 'bg-muted/40' : undefined}>
                  <TableCell>
                    <Link href={`${base}/runs/${h.runNumber}/tests/${h.resultId}`} className="font-semibold tabular-nums hover:underline">
                      #{h.runNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={h.outcome} />
                  </TableCell>
                  <TableCell className="text-muted-foreground" title={formatDateTime(h.startedAt)}>
                    {formatRelative(h.startedAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatDuration(h.durationMs)}</TableCell>
                  <TableCell className="text-code-s">{h.branch ?? '–'}</TableCell>
                  <TableCell className="text-right tabular-nums">{Math.max(0, h.attemptCount - 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-metric-s tabular-nums">{value}</div>
      {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function compareAttempts(attempts: { status: string; errors: { message?: string }[] }[]): string | null {
  if (attempts.length < 2) return null;
  const last = attempts[attempts.length - 1];
  const failedOnes = attempts.filter((a) => a.status !== 'passed' && a.status !== 'skipped');
  if (last.status === 'passed') return 'Failed before passing: the test is flaky on this run.';
  const msgs = new Set(failedOnes.map((a) => collapseWs(stripAnsi(a.errors[0]?.message ?? ''))));
  if (msgs.size <= 1) return 'Every attempt failed the same way.';
  return 'Attempts failed for different reasons.';
}
