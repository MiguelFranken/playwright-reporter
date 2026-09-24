import { AlertTriangle, CircleSlash, Loader2, MinusCircle, Repeat2, XCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '../components/badge';
import { cn } from '../lib/cn';
import { statusLabel, statusTone, toneBadge, toneSolid, type AnyStatus } from '../lib/tone';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  running: Loader2,
  passed: CheckCircle2,
  expected: CheckCircle2,
  failed: XCircle,
  unexpected: XCircle,
  flaky: Repeat2,
  skipped: MinusCircle,
  timedout: AlertTriangle,
  timedOut: AlertTriangle,
  interrupted: CircleSlash,
  incomplete: MinusCircle,
};

export type { AnyStatus };

export function StatusBadge({ status, className }: { status: AnyStatus | string; className?: string }) {
  const tone = statusTone(status);
  const Icon = ICONS[status] ?? MinusCircle;
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', toneBadge[tone], className)}>
      <Icon className={cn('size-3', status === 'running' && 'animate-spin')} />
      {statusLabel(status)}
    </Badge>
  );
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const tone = statusTone(status);
  return (
    <span
      title={statusLabel(status)}
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        toneSolid[tone],
        status === 'running' && 'animate-pulse',
        className,
      )}
    />
  );
}

/**
 * The status as a bare glyph in a tinted disc — what a dense list of test rows
 * wants, where a full badge per row would be a wall of pills. The label is
 * still carried, as the accessible name, so colour is never the only signal.
 */
export function StatusIcon({ status, className }: { status: AnyStatus | string; className?: string }) {
  const tone = statusTone(status);
  const Icon = ICONS[status] ?? MinusCircle;
  return (
    <span
      role="img"
      aria-label={statusLabel(status)}
      title={statusLabel(status)}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full border',
        toneBadge[tone],
        className,
      )}
    >
      <Icon className={cn('size-3', status === 'running' && 'animate-spin')} />
    </span>
  );
}
