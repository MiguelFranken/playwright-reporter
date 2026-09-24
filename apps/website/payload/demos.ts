/**
 * The product demos the site can embed. A demo is a real design-system view
 * rendered with the same fixtures Storybook uses, so it follows the visitor's
 * theme, is pixel-identical to the app and cannot go stale.
 *
 * This object is the single source of truth: the CMS select options come from
 * it, and `components/demos/index.tsx` is type-checked to have a renderer for
 * every key.
 */
export const DEMOS = {
  'active-runs': 'Active runs (animated)',
  'runs-table': 'Runs list',
  'run-summary': 'Run detail · Summary',
  'run-errors': 'Run detail · Errors',
  'result-attempts': 'Test result · attempts and evidence',
  'dashboard-metrics': 'Dashboard · metric cards',
  'pass-fail-chart': 'Dashboard · pass/fail trend',
  'flaky-tests': 'Dashboard · most flaky tests',
  'explorer-table': 'Test Explorer',
} as const;

export type DemoKey = keyof typeof DEMOS;

export const demoOptions = Object.entries(DEMOS).map(([value, label]) => ({ value, label }));

/**
 * The URL shown in the browser frame around each demo. Plain data, so it lives
 * here next to the keys rather than beside the components — which also lets a
 * test check the two lists have not drifted apart.
 */
export const DEMO_URLS: Record<DemoKey, string> = {
  'active-runs': 'reports.example.com/acme/web/runs',
  'runs-table': 'reports.example.com/acme/web/runs',
  'run-summary': 'reports.example.com/acme/web/runs/481',
  'run-errors': 'reports.example.com/acme/web/runs/481/errors',
  'result-attempts': 'reports.example.com/acme/web/results/4f21',
  'dashboard-metrics': 'reports.example.com/acme/web',
  'pass-fail-chart': 'reports.example.com/acme/web',
  'flaky-tests': 'reports.example.com/acme/web',
  'explorer-table': 'reports.example.com/acme/web/tests',
};
