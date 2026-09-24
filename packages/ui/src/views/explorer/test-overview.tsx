import { AlertTriangle, Bug, Layers, LayoutGrid, Server, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from '../../provider';
import { Badge } from '../../components/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { Skeleton } from '../../components/skeleton';
import { EmptyState } from '../../patterns/empty-state';
import { RunHistory } from './run-history';
import { ErrorBlock } from '../../patterns/error-block';
import { HistorySparkline } from '../../patterns/history-sparkline';
import { MetaChip } from '../../patterns/meta-chip';
import { ScoreMeter } from '../../patterns/score-meter';
import { StatGrid, type Stat } from '../../patterns/stat-grid';
import { StatusBadge } from '../../patterns/status-badge';
import { formatDateTime, formatDuration, formatPercent, formatRelative } from '../../lib/format';
import { cn } from '../../lib/cn';

/**
 * One test's record over the selected window.
 *
 * The order answers the questions in the order they get asked: what happened
 * last, how trustworthy is this test in general, does it behave differently
 * depending on where it runs, and then — only then — the run-by-run log. The
 * log is paged rather than scrolled, because "how far back does this go" is a
 * question a scrollbar answers badly.
 */

/** One run of this test, as the history list and sparkline read it. */
export interface HistoryRow {
  resultId: string;
  runId: string;
  runNumber: number;
  startedAt: Date;
  outcome: string;
  durationMs: number;
  attemptCount: number;
  branch: string | null;
  environment: string | null;
  executor: string;
  errorMessage: string | null;
  gitShortSha: string | null;
}

/** A distinct failure, grouped by error signature. */
export interface UniqueError {
  signature: string;
  message: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  lastRunNumber: number;
  lastResultId: string;
}

/** This test's behaviour in one environment, over the same window. */
export interface EnvironmentStat {
  environment: string | null;
  executions: number;
  failed: number;
  failureRate: number;
  flaky: number;
  flakyRate: number;
  avgDurationMs: number | null;
}

export interface TestOverviewStats {
  runs: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  reliability: number | null;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  failureRate: number;
  flakyRate: number;
  /** How many runs in a row ended the same way, and which way that was. */
  streak: number;
  streakKind: 'pass' | 'fail' | 'none';
  /** Distinct branches this test ran on in the window. */
  branches: number;
  topFailingBranch: string | null;
  /** Recent average against the earlier average: >1 is slower. */
  durationTrend: number | null;
  /** True when it fails often enough, for long enough, to be a standing problem. */
  chronic: boolean;
}

export interface TestOverviewData {
  history: HistoryRow[];
  errors: UniqueError[];
  stats: TestOverviewStats;
  environments: EnvironmentStat[];
  siblings: { testId: string; pwProject: string }[];
}

/**
 * The part of a test's record the explorer table already holds when a row is
 * clicked. Handing it to the drawer lets the summary paint from the list while
 * the full overview is still in flight, so only the parts nothing is known
 * about — history, errors, environments — start as placeholders.
 */
export interface TestOverviewPreview {
  lastOutcome: string;
  lastRunAt: Date;
  lastRunNumber: number;
  lastBranch: string | null;
  runs: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  reliability: number | null;
  avgDurationMs: number | null;
  flakyRate: number;
  failureRate: number;
  /** The *failure* streak, which is all a list row carries. */
  streak: number;
}

/** Widens a row into the stats shape, leaving the fields it cannot know null. */
function previewStats(p: TestOverviewPreview): TestOverviewStats {
  // A list row counts failures only, so a passing test's streak reads 0 there
  // and would be captioned "Pass streak 0" — a number that then jumps when the
  // real one arrives. It is left out until the overview can say.
  const failing = p.lastOutcome === 'failed' || p.lastOutcome === 'timedout';
  return {
    runs: p.runs,
    passed: p.passed,
    failed: p.failed,
    flaky: p.flaky,
    skipped: p.skipped,
    reliability: p.reliability,
    avgDurationMs: p.avgDurationMs,
    p95DurationMs: null,
    failureRate: p.failureRate,
    flakyRate: p.flakyRate,
    streak: p.streak,
    streakKind: failing && p.streak > 0 ? 'fail' : 'none',
    branches: 0,
    topFailingBranch: null,
    durationTrend: null,
    chronic: false,
  };
}

export interface TestOverviewHrefs {
  /** A single result inside a run. */
  result: (runNumber: number, resultId: string) => string;
  /** The same test on another platform. */
  sibling: (testId: string) => string;
}

export function TestOverview({
  hrefs,
  overview,
  preview,
  days,
  platform,
  onSiblingSelect,
  now = new Date(),
}: {
  hrefs: TestOverviewHrefs;
  /** Null while the overview is still loading — see `preview`. */
  overview: TestOverviewData | null;
  /** What the caller already knew, used to paint the summary before `overview` lands. */
  preview?: TestOverviewPreview;
  days: number;
  /** The Playwright project this test belongs to, shown beside the score. */
  platform?: string;
  /**
   * Lets a host that is already showing this view swap it in place. The badge
   * keeps its href either way, so middle-click and cmd-click still open the
   * sibling's own page; only a plain left click is intercepted.
   */
  onSiblingSelect?: (testId: string) => void;
  /** Reference instant for the "last N days" window; pinned by stories. */
  now?: Date;
}) {
  const { history, errors, environments, siblings } = overview ?? {
    history: [],
    errors: [],
    environments: [],
    siblings: [],
  };
  const stats = overview?.stats ?? (preview ? previewStats(preview) : null);
  const recent = history.filter((h) => h.startedAt.getTime() >= now.getTime() - days * 24 * 60 * 60 * 1000);
  const shown = recent.length ? recent : history;
  const latest = shown[0];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-e1">
        {latest ? (
          <div className="flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground">
            <StatusBadge status={latest.outcome} />
            <Link href={hrefs.result(latest.runNumber, latest.resultId)} className="font-medium text-foreground tabular-nums hover:underline">
              #{latest.runNumber}
            </Link>
            {latest.branch ? <MetaChip>{latest.branch}</MetaChip> : null}
            {latest.environment ? <MetaChip icon={Server}>{latest.environment}</MetaChip> : null}
            <span className="tabular-nums">{formatDuration(latest.durationMs)}</span>
            <span title={formatDateTime(latest.startedAt)} suppressHydrationWarning>
              {formatRelative(latest.startedAt, { now })}
            </span>
          </div>
        ) : preview ? (
          // Same line, minus the two fields a list row does not carry: the
          // result id the run number links to, and the last duration.
          <div className="flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground">
            <StatusBadge status={preview.lastOutcome} />
            <span className="font-medium text-foreground tabular-nums">#{preview.lastRunNumber}</span>
            {preview.lastBranch ? <MetaChip>{preview.lastBranch}</MetaChip> : null}
            <span title={formatDateTime(preview.lastRunAt)} suppressHydrationWarning>
              {formatRelative(preview.lastRunAt, { now })}
            </span>
          </div>
        ) : (
          <Skeleton className="h-5 w-64" />
        )}

        <ScoreMeter
          score={stats?.reliability ?? null}
          risk={
            stats?.chronic ? (
              <Badge variant="outline" className="border-danger-border bg-danger-subtle font-medium text-danger-text">
                Chronic
              </Badge>
            ) : null
          }
          trailing={
            <>
              {platform ? <MetaChip>{platform}</MetaChip> : null}
              <MetaChip>{days}-day window</MetaChip>
            </>
          }
        />

        {stats ? <StatGrid columns={5} stats={buildStats(stats, { partial: !overview })} /> : <StatGridSkeleton />}

        <div className="flex items-center justify-between gap-3 border-t border-separator pt-3">
          {overview ? (
            <>
              <span className="text-body-xs text-muted-foreground">Last {Math.min(shown.length, 20)} outcomes, oldest first</span>
              <HistorySparkline history={shown.map((h) => h.outcome)} cells={Math.min(20, Math.max(10, shown.length))} />
            </>
          ) : (
            <>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-40" />
            </>
          )}
        </div>
      </section>

      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">
            <LayoutGrid aria-hidden />
            Overview
          </TabsTrigger>
          <TabsTrigger value="errors">
            <Bug aria-hidden />
            Errors
            {errors.length ? (
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-label-xs tabular-nums">
                {errors.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-5 pt-4">
          {!overview ? <RunHistorySkeleton /> : null}

          {environments.length > 1 || (environments.length === 1 && environments[0]?.environment) ? (
            <EnvironmentAnalytics environments={environments} />
          ) : null}

          {overview ? (
          <RunHistory
            now={now}
            rows={shown.map((h) => ({
              resultId: h.resultId,
              runNumber: h.runNumber,
              startedAt: h.startedAt,
              outcome: h.outcome,
              durationMs: h.durationMs,
              attemptCount: h.attemptCount,
              branch: h.branch,
              href: hrefs.result(h.runNumber, h.resultId),
            }))}
          />
          ) : null}

          {siblings.length ? (
            <div className="flex flex-wrap items-center gap-1.5 text-body-xs text-muted-foreground">
              <Layers className="size-3.5" aria-hidden />
              <span>Also runs on</span>
              {siblings.map((s) => (
                <Badge
                  key={s.testId}
                  variant="outline"
                  className="font-normal"
                  render={<Link href={hrefs.sibling(s.testId)} />}
                  {...(onSiblingSelect
                    ? {
                        onClick: (event: React.MouseEvent) => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                          event.preventDefault();
                          onSiblingSelect(s.testId);
                        },
                      }
                    : null)}
                >
                  {s.pwProject || 'default'}
                </Badge>
              ))}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="errors" className="pt-4">
          {!overview ? (
            <div className="flex flex-col gap-2" aria-hidden>
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ) : errors.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="No errors" description={`No failures recorded in the last ${days} days.`} />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-label-m">
                  <AlertTriangle className="size-4 text-warning-text" aria-hidden />
                  Unique errors in this window
                </h2>
                <span className="text-body-xs text-muted-foreground tabular-nums">
                  {errors.length} {errors.length === 1 ? 'error' : 'errors'}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {errors.map((e) => (
                  <li key={e.signature} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-e1">
                    <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
                      <span title={formatDateTime(e.firstSeen)} suppressHydrationWarning>
                        First {formatRelative(e.firstSeen, { now })}
                      </span>
                      <span aria-hidden>·</span>
                      <span title={formatDateTime(e.lastSeen)} suppressHydrationWarning>
                        last {formatRelative(e.lastSeen, { now })}
                      </span>
                      <Badge variant="outline" className="ms-auto border-danger-border bg-danger-subtle text-danger-text tabular-nums">
                        {e.count}×
                      </Badge>
                    </div>
                    <ErrorBlock message={e.message} lines={4} />
                    <Link
                      href={hrefs.result(e.lastRunNumber, e.lastResultId)}
                      className="self-end text-body-xs font-medium hover:underline"
                    >
                      View the last failure · #{e.lastRunNumber}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * `partial` marks a stats object widened from a list row: the fields it cannot
 * know are omitted rather than reported as zero, so nothing on screen has to be
 * corrected once the real overview arrives.
 */
function buildStats(stats: TestOverviewStats, { partial = false }: { partial?: boolean } = {}): Stat[] {
  const out: Stat[] = [
    { label: 'Runs', value: stats.runs },
    {
      label: 'Failure rate',
      value: formatPercent(stats.failureRate, 1),
      tone: stats.failureRate > 0 ? 'danger' : 'success',
    },
    {
      label: 'Flaky rate',
      value: formatPercent(stats.flakyRate, 1),
      tone: stats.flakyRate > 0 ? 'warning' : 'success',
    },
  ];

  if (stats.streakKind !== 'none') {
    out.push({
      label: stats.streakKind === 'fail' ? 'Failure streak' : 'Pass streak',
      value: stats.streak,
      tone: stats.streakKind === 'fail' ? 'danger' : 'success',
    });
  }

  out.push({
    label: 'Avg duration',
    value: formatDuration(stats.avgDurationMs),
    hint: stats.p95DurationMs ? `p95 ${formatDuration(stats.p95DurationMs)}` : undefined,
  });

  if (stats.durationTrend !== null) {
    // Within ±10% is noise, not a trend — a test whose timing wobbles a little
    // between runs should not be reported as getting slower every day.
    const slower = stats.durationTrend > 1.1;
    const faster = stats.durationTrend < 0.9;
    out.push({
      label: 'Duration trend',
      value: (
        <span className="inline-flex items-center gap-1">
          {slower ? <TrendingUp className="size-3.5" aria-hidden /> : faster ? <TrendingDown className="size-3.5" aria-hidden /> : null}
          {slower ? 'Slower' : faster ? 'Faster' : 'Steady'}
        </span>
      ),
      tone: slower ? 'warning' : faster ? 'success' : 'neutral',
      hint: `${Math.round(stats.durationTrend * 100)}% of earlier average`,
    });
  }

  if (!partial) out.push({ label: 'Branches', value: stats.branches });
  if (stats.topFailingBranch) {
    out.push({ label: 'Top failing branch', value: stats.topFailingBranch, mono: true, tone: 'danger' });
  }
  return out;
}

function StatGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}

function RunHistorySkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <div className="panel flex flex-col">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-separator px-4 py-3 last:border-b-0">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EnvironmentAnalytics({ environments }: { environments: EnvironmentStat[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-label-m">
        <Server className="size-4 text-muted-foreground" aria-hidden />
        Environment analytics
      </h2>
      <div className="panel overflow-x-auto">
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Environment</TableHead>
              <TableHead className="text-right">Runs</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Fail %</TableHead>
              <TableHead className="text-right">Flaky</TableHead>
              <TableHead className="text-right">Flaky %</TableHead>
              <TableHead className="text-right">Avg duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {environments.map((env) => (
              <TableRow key={env.environment ?? 'unmapped'}>
                <TableCell className="font-medium">
                  {env.environment ?? <span className="font-normal text-muted-foreground">Unmapped</span>}
                </TableCell>
                <TableCell className="text-right">{env.executions}</TableCell>
                <TableCell className="text-right">{env.failed}</TableCell>
                <TableCell className={cn('text-right', env.failureRate > 0 ? 'text-danger-text' : 'text-success-text')}>
                  {formatPercent(env.failureRate, 1)}
                </TableCell>
                <TableCell className="text-right">{env.flaky}</TableCell>
                <TableCell className={cn('text-right', env.flakyRate > 0 ? 'text-warning-text' : 'text-success-text')}>
                  {formatPercent(env.flakyRate, 1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{formatDuration(env.avgDurationMs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
