import { formatDistanceToNowStrict, formatDistanceStrict } from 'date-fns';

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '–';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  if (m < 60) return `${m}m ${rest}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * `options.now` pins the reference instant. The app leaves it out and gets the
 * wall clock; stories and tests pass a fixture so the rendered string — and any
 * assertion or screenshot over it — is deterministic.
 */
export function formatRelative(
  date: Date | string | null | undefined,
  options?: { now?: Date },
): string {
  if (!date) return '–';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (options?.now) return formatDistanceStrict(d, options.now, { addSuffix: true });
  return `${formatDistanceToNowStrict(d, { addSuffix: true })}`;
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '–';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatPercent(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return '–';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function shortSha(sha: string | null | undefined) {
  return sha ? sha.slice(0, 7) : '';
}
