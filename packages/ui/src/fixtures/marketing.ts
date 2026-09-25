import type { FooterColumn, SocialLink } from '../marketing/site-footer';
import type { ComparisonColumn, ComparisonRow } from '../marketing/comparison-table';
import type { MarketingLink, ThemedImageSources } from '../lib/marketing';

/**
 * Copy for the marketing stories. Real sentences from WEBSITE.md rather than
 * lorem ipsum: half the point of these stories is to check that the actual
 * headline fits on a phone.
 */

export const SITE_NAME = 'Playwright Reporter';

export const nav = [
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/get-started', label: 'Get started' },
  { href: '/compare', label: 'Compare' },
];

export const primaryCta: MarketingLink = {
  href: '/get-started',
  label: 'Get started',
  appearance: 'primary',
};

export const githubCta: MarketingLink = {
  href: 'https://github.com/mfranken/playwright-reporter',
  label: 'View on GitHub',
  appearance: 'secondary',
  external: true,
};

export const heroLead =
  'A self-hosted home for your Playwright runs: live progress while CI executes, every failure with its trace, video and history, and the flaky tests ranked before they cost you a morning.';

export const featureItems = [
  {
    title: 'Live runs',
    description:
      'Results stream in while the job is still running. Progress, per-shard state and counts update over SSE — no upload step at the end.',
  },
  {
    title: 'Debugging evidence',
    description:
      'Error and stack, every step with its timing, screenshots, video, the visual diff and a link into the trace viewer.',
  },
  {
    title: 'Flakiness analytics',
    description:
      'Flaky detection within and across runs, a reliability score per test, chronic failures and a history sparkline.',
  },
];

export const comparisonColumns: ComparisonColumn[] = [
  { label: 'Playwright HTML report' },
  { label: 'This reporter', highlight: true },
  { label: 'Hosted SaaS' },
];

export const comparisonRows: ComparisonRow[] = [
  {
    capability: 'Survives the CI job',
    cells: [{ state: 'no' }, { state: 'yes' }, { state: 'yes' }],
  },
  {
    capability: 'History across runs',
    cells: [{ state: 'no' }, { state: 'yes', note: 'Unlimited, in your database' }, { state: 'yes', note: 'Per plan' }],
  },
  {
    capability: 'Flaky-test analytics',
    cells: [{ state: 'no' }, { state: 'yes' }, { state: 'yes' }],
  },
  {
    capability: 'Trace viewer',
    cells: [
      { state: 'yes' },
      { state: 'yes', note: 'Embedded, served by your app' },
      { state: 'partial', note: 'Links out too' },
    ],
  },
  {
    capability: 'You own the data',
    cells: [{ state: 'yes' }, { state: 'yes', note: 'Your Postgres, your blob store' }, { state: 'no' }],
  },
];

export const faqItems = [
  {
    question: 'Does it replace the Playwright trace viewer?',
    answer: 'No. It embeds the Playwright Trace Viewer itself, served from your own deployment, so traces never leave it.',
  },
  {
    question: 'What does it cost to run?',
    answer: 'A Postgres database and a Vercel project. On free tiers, nothing.',
  },
  {
    question: 'Which CI providers work?',
    answer: 'Any of them. The reporter reads the usual environment variables and falls back to git.',
  },
  {
    question: 'Does it work with shards?',
    answer: 'Yes. Each shard reports separately and the run merges them as they arrive.',
  },
];

export const footerColumns: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/compare', label: 'Compare' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/get-started', label: 'Get started' },
      { href: 'https://github.com/mfranken/playwright-reporter', label: 'GitHub', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/legal/imprint', label: 'Imprint' },
      { href: '/legal/privacy', label: 'Privacy' },
    ],
  },
];

export const footerLegal: MarketingLink[] = [
  { href: '/legal/imprint', label: 'Imprint' },
  { href: '/legal/privacy', label: 'Privacy' },
];

export const social: SocialLink[] = [
  { platform: 'github', url: 'https://github.com/mfranken/playwright-reporter' },
];

export const reporterSnippet = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [['@miguelfranken/reporter', {
    url: process.env.PW_REPORTER_URL,
    token: process.env.PW_REPORTER_TOKEN,
  }]],
});`;

export const envSnippet = `PW_REPORTER_URL=https://reports.example.com
PW_REPORTER_TOKEN=prj_live_…`;

/**
 * A placeholder screenshot pair, drawn inline. Stories then render the same
 * in CI, offline and in a screenshot, with no asset pipeline to keep in sync —
 * the trick the attempt fixtures already use.
 */
function placeholder(label: string, bg: string, fg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900"><rect width="1440" height="900" fill="${bg}"/><rect x="48" y="48" width="1344" height="96" rx="16" fill="${fg}" opacity="0.12"/><rect x="48" y="184" width="880" height="668" rx="16" fill="${fg}" opacity="0.08"/><rect x="960" y="184" width="432" height="320" rx="16" fill="${fg}" opacity="0.08"/><text x="720" y="884" font-family="monospace" font-size="24" fill="${fg}" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const screenshotPair: ThemedImageSources = {
  light: { src: placeholder('run detail — light', '#eef1f6', '#1c2024'), width: 1440, height: 900 },
  dark: { src: placeholder('run detail — dark', '#15171c', '#e8eaef'), width: 1440, height: 900 },
  alt: 'The run detail screen, with the Summary, Specs, Errors and Configuration tabs.',
};
