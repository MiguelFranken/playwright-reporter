import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
// The hero demo is above the fold on the home page, so it is the one demo
// worth having in the first chunk.
import { ActiveRunsDemo } from '@repo/ui/marketing/demos/active-runs';
import type { DemoKey } from '@/payload/demos';

/**
 * Every demo key, resolved to the component that renders it.
 *
 * The `Record<DemoKey, …>` is the point: adding a key to `payload/demos.ts`
 * without a renderer here fails `check-types` rather than rendering a blank
 * section in production.
 *
 * Everything below the hero is loaded lazily. Between them the demos pull in
 * the table and chart libraries — around 380 KiB of JavaScript — and a
 * marketing page has no business shipping the chart for a demo the reader may
 * never scroll to. `next/dynamic` still server-renders each one, so the
 * prerendered HTML is unchanged and only the client chunk is deferred.
 */
export const demoComponents: Record<DemoKey, ComponentType> = {
  'active-runs': ActiveRunsDemo,
  'runs-table': dynamic(() => import('@repo/ui/marketing/demos/runs-table').then((m) => m.RunsTableDemo)),
  'run-summary': dynamic(() => import('@repo/ui/marketing/demos/run-summary').then((m) => m.RunSummaryDemo)),
  'run-errors': dynamic(() => import('@repo/ui/marketing/demos/run-errors').then((m) => m.RunErrorsDemo)),
  'result-attempts': dynamic(() =>
    import('@repo/ui/marketing/demos/result-attempts').then((m) => m.ResultAttemptsDemo),
  ),
  'dashboard-metrics': dynamic(() =>
    import('@repo/ui/marketing/demos/dashboard-metrics').then((m) => m.DashboardMetricsDemo),
  ),
  'pass-fail-chart': dynamic(() =>
    import('@repo/ui/marketing/demos/pass-fail-chart').then((m) => m.PassFailChartDemo),
  ),
  'flaky-tests': dynamic(() => import('@repo/ui/marketing/demos/flaky-tests').then((m) => m.FlakyTestsDemo)),
  'explorer-table': dynamic(() =>
    import('@repo/ui/marketing/demos/explorer-table').then((m) => m.ExplorerTableDemo),
  ),
};

export function Demo({ demo }: { demo: DemoKey }) {
  const Component = demoComponents[demo];
  return <Component />;
}
