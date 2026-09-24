import { commitTitle } from '@miguelfranken/ui/lib/commit';
import { formatDuration } from '@miguelfranken/ui/lib/format';
import { statusLabel } from '@miguelfranken/ui/lib/tone';

/** What the service worker (`public/push-sw.js`) shows. */
export interface PushMessage {
  title: string;
  body: string;
  /** Opened on click; a path on this app's origin. */
  url: string;
  /** A later notification with the same tag replaces the earlier one. */
  tag: string;
}

export type RunNotificationKind = 'started' | 'finished';

export interface RunNotificationSubject {
  id: string;
  number: number;
  status: string;
  endReason: string | null;
  durationMs: number | null;
  gitBranch: string | null;
  gitMessage: string | null;
  gitShortSha: string | null;
  project: { slug: string; name: string };
  team: { slug: string };
}

export interface RunCounts {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

export function runMessage(kind: RunNotificationKind, run: RunNotificationSubject, counts?: RunCounts): PushMessage {
  const url = `/teams/${run.team.slug}/projects/${run.project.slug}/runs/${run.number}`;
  // Started and finished share a tag, so the result replaces the start.
  const tag = `run-${run.id}`;
  const commit = commitTitle(run).text;
  const where = run.gitBranch ? `${run.gitBranch} · ${commit}` : commit;
  if (kind === 'started') {
    return { title: `${run.project.name}: run #${run.number} started`, body: where, url, tag };
  }
  const label = run.endReason === 'stale' ? 'abandoned' : statusLabel(run.status).toLowerCase();
  const facts = [countsLine(counts), run.durationMs == null ? null : formatDuration(run.durationMs)].filter(Boolean);
  return {
    title: `${run.project.name}: run #${run.number} ${label}`,
    body: [facts.join(' · '), where].filter(Boolean).join('\n'),
    url,
    tag,
  };
}

function countsLine(counts: RunCounts | undefined) {
  if (!counts) return null;
  const parts = [
    counts.failed ? `${counts.failed} failed` : null,
    counts.flaky ? `${counts.flaky} flaky` : null,
    `${counts.passed} passed`,
    counts.skipped ? `${counts.skipped} skipped` : null,
  ];
  return parts.filter(Boolean).join(', ');
}
