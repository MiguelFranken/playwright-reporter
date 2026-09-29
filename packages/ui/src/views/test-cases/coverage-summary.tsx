import { Bot, FileQuestion, Hourglass, Layers, ShieldAlert, XCircle } from 'lucide-react';
import { MetricCard } from '../../patterns/metric-card';
import { cn } from '../../lib/cn';
import { formatNumber, formatPercent } from '../../lib/format';
import type { CoverageSummary as Coverage } from '../../lib/test-case-models';
import { toneText } from '../../lib/tone';
import { Link } from '../../provider';

export interface CoverageSummaryHrefs {
  /** The list filtered to one of the summary's buckets. */
  planned: string;
  failing: string;
  attention: string;
  /** Where Playwright tests without a case can be adopted. */
  uncovered?: string;
}

/**
 * The library at a glance. Deprecated cases are counted in the total but left
 * out of every other number: nobody needs to automate a case that is retired.
 */
export function CoverageSummary({ coverage, hrefs, className }: { coverage: Coverage; hrefs: CoverageSummaryHrefs; className?: string }) {
  const live = coverage.total - coverage.byStatus.deprecated;
  const automated = coverage.byAutomation.automated;
  const share = live ? automated / live : null;
  const attention = coverage.flaky + coverage.stale + coverage.unverified;
  return (
    <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6', className)}>
      <MetricCard
        icon={Layers}
        label="Test cases"
        value={formatNumber(coverage.total)}
        subtext={`${formatNumber(coverage.byStatus.active)} active · ${formatNumber(coverage.byStatus.draft)} draft · ${formatNumber(coverage.byStatus.deprecated)} deprecated`}
      />
      <MetricCard
        icon={Bot}
        label="Automated"
        value={formatPercent(share)}
        subtext={`${formatNumber(automated)} of ${formatNumber(live)} cases`}
        hint="Cases marked automated, of every case that is not deprecated. A link to a Playwright test marks a case automated."
      />
      <MetricCard
        icon={Hourglass}
        label="To be automated"
        value={<Figure href={hrefs.planned} value={coverage.byAutomation.planned} label="Show cases to be automated" />}
        subtext={`${formatNumber(coverage.byAutomation.manual)} stay manual`}
      />
      <MetricCard
        icon={XCircle}
        label="Failing"
        value={<Figure href={hrefs.failing} value={coverage.failing} tone={coverage.failing ? toneText.danger : undefined} label="Show failing cases" />}
        subtext="Latest run of a linked test failed"
      />
      <MetricCard
        icon={ShieldAlert}
        label="Needs attention"
        value={<Figure href={hrefs.attention} value={attention} tone={attention ? toneText.warning : undefined} label="Show cases that need attention" />}
        subtext={`${coverage.flaky} flaky · ${coverage.stale} stale · ${coverage.unverified} unverified`}
        hint="Flaky: a linked test needed retries in 30 days. Stale: no linked test ran in 14 days. Unverified: marked automated without a linked test."
      />
      <MetricCard
        icon={FileQuestion}
        label="Tests without a case"
        value={hrefs.uncovered ? <Figure href={hrefs.uncovered} value={coverage.uncoveredTests} label="Adopt tests without a case" /> : formatNumber(coverage.uncoveredTests)}
        subtext="Playwright tests seen in 30 days"
      />
    </div>
  );
}

function Figure({ href, value, tone, label }: { href: string; value: number; tone?: string; label: string }) {
  return (
    <Link href={href} className={cn('rounded hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none', tone)} aria-label={`${formatNumber(value)}: ${label}`}>
      {formatNumber(value)}
    </Link>
  );
}
