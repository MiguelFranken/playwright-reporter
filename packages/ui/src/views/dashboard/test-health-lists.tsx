import { Flame, ShieldCheck } from 'lucide-react';
import { Link } from '../../provider';
import { EmptyState } from '../../patterns/empty-state';
import { StatusBadge } from '../../patterns/status-badge';
import { Badge } from '../../components/badge';

/** A test's health over the selected range, as the dashboard lists it. */
export interface TestHealthRow {
  testId: string;
  title: string;
  file: string;
  pwProject: string;
  runs: number;
  failed: number;
  flaky: number;
  flakyRate: number;
  failureRate: number;
  streak: number;
  lastOutcome: string;
  lastRunNumber: number;
  avgDurationMs: number;
}

export interface TestHealthHrefs {
  test: (testId: string) => string;
}

import { formatPercent } from '../../lib/format';
import { flakyLabel } from '../../lib/reliability';
import { cn } from '../../lib/cn';
import { gradeBadge } from '../../lib/tone';

function TestRow({ hrefs, t, right }: { hrefs: TestHealthHrefs; t: TestHealthRow; right: React.ReactNode }) {
  return (
    <li>
      <Link
        href={hrefs.test(t.testId)}
        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium" title={t.title}>
              {t.title}
            </span>
            <Badge variant="outline" className="hidden shrink-0 font-normal text-muted-foreground sm:inline-flex">
              {t.pwProject}
            </Badge>
          </div>
          <p className="truncate text-code-s text-muted-foreground" title={t.file}>
            {t.file}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">{right}</div>
      </Link>
    </li>
  );
}

export function FlakyTestsList({ hrefs, rows }: { hrefs: TestHealthHrefs; rows: TestHealthRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={ShieldCheck} title="No flaky tests" description="No test was flaky in this range." className="m-(--card-spacing) py-8" />;
  }
  return (
    <ul className="divide-y">
      {rows.map((t) => {
        const fl = flakyLabel(t.flakyRate);
        return (
          <TestRow
            key={t.testId}
            hrefs={hrefs}
            t={t}
            right={
              <>
                <span className="hidden text-muted-foreground tabular-nums md:inline">
                  {t.flaky}/{t.runs} runs
                </span>
                <Badge variant="outline" className={cn('tabular-nums', gradeBadge[fl.tone])} title={fl.label}>
                  {formatPercent(t.flakyRate)} flaky
                </Badge>
              </>
            }
          />
        );
      })}
    </ul>
  );
}

export function ChronicFailuresList({ hrefs, rows }: { hrefs: TestHealthHrefs; rows: TestHealthRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={ShieldCheck} title="No chronic failures" description="No test is failing repeatedly in this range." className="m-(--card-spacing) py-8" />;
  }
  return (
    <ul className="divide-y">
      {rows.map((t) => (
        <TestRow
          key={t.testId}
          hrefs={hrefs}
          t={t}
          right={
            <>
              {t.streak > 1 ? (
                <Badge variant="outline" className={cn('gap-1 tabular-nums', gradeBadge.bad)}>
                  <Flame />
                  {t.streak} in a row
                </Badge>
              ) : null}
              <span className="text-muted-foreground tabular-nums">
                {formatPercent(t.failureRate)} <span className="hidden sm:inline">failed</span>
                <span className="hidden text-muted-foreground md:inline"> · {t.runs} runs</span>
              </span>
              <StatusBadge status={t.lastOutcome} className="hidden sm:inline-flex" />
            </>
          }
        />
      ))}
    </ul>
  );
}
