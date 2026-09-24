import { Clock, ExternalLink, GitBranch, GitCommitHorizontal, Server, Tag, User } from 'lucide-react';
import { Link } from '../../provider';
import { CountsBar } from '../../patterns/counts-bar';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge, StatusDot } from '../../patterns/status-badge';
import { Badge } from '../../components/badge';
import type { RunCounts } from '../../patterns/counts-bar';
import type { AnyStatus } from '../../lib/tone';
import { formatDateTime, formatDuration, formatRelative } from '../../lib/format';

/**
 * Exactly the fields the header reads — it used to take a whole database row
 * and use seven of them. `gitCommitUrl` arrives resolved: which shape a commit
 * URL takes is a git-provider question, and the header does not know providers.
 */
export interface RunHeaderData {
  number: number;
  status: AnyStatus | string;
  startedAt: Date;
  durationMs: number | null;
  executor: string;
  expectedTests: number;
  shardTotal: number;
  gitBranch: string | null;
  gitMessage: string | null;
  gitShortSha: string | null;
  gitCommitUrl: string | null;
  gitAuthorName: string | null;
  gitAuthorEmail: string | null;
  environment: string | null;
  ciProvider: string | null;
  ciBuildNumber: string | null;
  ciBuildUrl: string | null;
  tags: string[];
  /** When the reporter was last heard from; explains an abandoned run. */
  lastEventAt?: Date | null;
}

export interface RunHeaderShard {
  shardIndex: number;
  status: string;
  expectedTests: number;
  durationMs: number | null;
  hostname: string | null;
}

export function RunHeader({
  run,
  counts,
  shards,
  liveIndicator,
  actions,
  branchHref,
  now = new Date(),
}: {
  run: RunHeaderData;
  counts: RunCounts;
  shards: RunHeaderShard[];
  /** The app fills this with <LiveRefresh />; a story with a static indicator. */
  liveIndicator?: React.ReactNode;
  /**
   * Buttons at the end of the title row, e.g. the "Debug with AI" menu. A slot
   * rather than a flag, so the header stays ignorant of what the app offers.
   */
  actions?: React.ReactNode;
  /** The branch's page, resolved by the host; without it the branch is plain text. */
  branchHref?: string;
  /** Reference instant for a still-running run's elapsed time. */
  now?: Date;
}) {
  const title = run.gitMessage?.split('\n')[0]?.trim() || `Run #${run.number}`;
  const sha = run.gitShortSha;
  const shaHref = run.gitCommitUrl;
  const showShards = run.shardTotal > 1 || shards.length > 1;
  const duration = run.durationMs ?? (run.status === 'running' ? now.getTime() - run.startedAt.getTime() : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <StatusBadge
            status={run.status}
            className="h-6 px-2.5 text-sm"
            title={run.status === 'incomplete' && run.lastEventAt ? `No data from the reporter since ${formatDateTime(run.lastEventAt)}` : undefined}
          />
          <h1
            className="min-w-0 flex-1 truncate text-title-m md:text-title-l"
            title={run.gitMessage ?? undefined}
          >
            {title}
          </h1>
          {liveIndicator}
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {run.gitBranch ? (
            branchHref ? (
              <Link href={branchHref} className="inline-flex items-center gap-1.5 text-code-s hover:text-foreground hover:underline">
                <GitBranch className="size-3.5" />
                {run.gitBranch}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-code-s">
                <GitBranch className="size-3.5" />
                {run.gitBranch}
              </span>
            )
          ) : null}
          {run.environment ? <Badge variant="secondary">{run.environment}</Badge> : null}
          {sha ? (
            shaHref ? (
              <a href={shaHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-code-s hover:text-foreground hover:underline">
                <GitCommitHorizontal className="size-3.5" />
                {sha}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-code-s">
                <GitCommitHorizontal className="size-3.5" />
                {sha}
              </span>
            )
          ) : null}
          {run.gitAuthorName ? (
            <span className="inline-flex items-center gap-1.5" title={run.gitAuthorEmail ?? undefined}>
              <User className="size-3.5" />
              {run.gitAuthorName}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5" title={formatDateTime(run.startedAt)}>
            <Clock className="size-3.5" />
            {formatRelative(run.startedAt)}
          </span>
          <span className="tabular-nums" title="Duration">
            {formatDuration(duration)}
          </span>
          <Badge variant="outline" className="uppercase">
            {run.executor}
          </Badge>
          {run.ciBuildUrl ? (
            <a href={run.ciBuildUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
              <Server className="size-3.5" />
              {run.ciProvider ? `${run.ciProvider} build` : 'CI build'}
              {run.ciBuildNumber ? ` #${run.ciBuildNumber}` : ''}
              <ExternalLink className="size-3" />
            </a>
          ) : null}
          {run.tags.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-1">
              <Tag className="size-3.5" />
              {run.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </span>
          ) : null}
        </div>
      </div>

      <CountsBar counts={counts} total={Math.max(run.expectedTests, counts.total)} />

      {showShards ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-eyebrow text-muted-foreground">
            Shards ({shards.length}/{Math.max(run.shardTotal, shards.length)})
          </span>
          <div className="flex flex-wrap gap-2">
            {shards.map((s) => (
              <div
                key={s.shardIndex}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-e1 tabular-nums"
                title={s.hostname ?? undefined}
              >
                <StatusDot status={s.status} />
                <span className="font-medium">Shard {s.shardIndex}</span>
                <span className="text-muted-foreground">{s.expectedTests} tests</span>
                <span className="text-muted-foreground">{formatDuration(s.durationMs)}</span>
              </div>
            ))}
            {Array.from({ length: Math.max(0, run.shardTotal - shards.length) }).map((_, i) => (
              <div key={`pending-${i}`} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border-strong px-2.5 py-1.5 text-xs text-muted-foreground">
                <StatusDot status="skipped" />
                Waiting for shard…
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RunHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-7 w-80 max-w-[60%]" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {[96, 80, 110, 70, 64].map((w, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: w }} />
        ))}
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-3 w-72" />
    </div>
  );
}
