import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Activity, Bug, Repeat2 } from 'lucide-react';
import {
  comparisonColumns,
  comparisonRows,
  envSnippet,
  faqItems,
  featureItems,
  footerColumns,
  footerLegal,
  githubCta,
  heroLead,
  nav,
  primaryCta,
  reporterSnippet,
  SITE_NAME,
  social,
} from '../fixtures/marketing';
import { AnnouncementBar } from '../marketing/announcement-bar';
import { BrowserFrame } from '../marketing/browser-frame';
import { CodeTabs } from '../marketing/code-tabs';
import { ComparisonTable } from '../marketing/comparison-table';
import { CtaBand } from '../marketing/cta-band';
import { ExplorerTableDemo } from '../marketing/demos/explorer-table';
import { FlakyTestsDemo } from '../marketing/demos/flaky-tests';
import { ResultAttemptsDemo } from '../marketing/demos/result-attempts';
import { RunSummaryDemo } from '../marketing/demos/run-summary';
import { Faq } from '../marketing/faq';
import { FeatureGrid } from '../marketing/feature-grid';
import { FeatureShowcase } from '../marketing/feature-showcase';
import { Hero } from '../marketing/hero';
import { LiveRunDemo } from '../marketing/live-run-demo';
import { Section } from '../marketing/section';
import { SiteFooter } from '../marketing/site-footer';
import { SiteHeader } from '../marketing/site-header';
import { StatsBand } from '../marketing/stats-band';
import { Steps } from '../marketing/steps';

/**
 * The integration check for the marketing layer: the home page of WEBSITE.md
 * §4, composed from the same components the CMS blocks render, with no CMS.
 * If a section needs something the components cannot supply, that is the
 * signal a block's field set is wrong.
 */
const meta = {
  title: 'Pages/Marketing Home',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const icons = [Activity, Bug, Repeat2];

const ciSnippet = `- name: Run Playwright
  run: pnpm exec playwright test
  env:
    PW_REPORTER_URL: \${{ vars.PW_REPORTER_URL }}
    PW_REPORTER_TOKEN: \${{ secrets.PW_REPORTER_TOKEN }}`;

export const Default: Story = {
  render: () => (
    <div className="min-h-dvh bg-background">
      <AnnouncementBar text="v0.4 adds per-shard progress and the flaky-test drawer." href="/features" linkLabel="What's new" />
      <SiteHeader siteName={SITE_NAME} nav={nav} ctas={[primaryCta]} githubHref={githubCta.href} />

      <Hero
        variant="split"
        eyebrow="Self-hosted · Open source"
        heading="Every Playwright run, kept."
        lead={<p>{heroLead}</p>}
        links={[primaryCta, githubCta]}
        visual={
          <BrowserFrame url="reports.example.com/acme/web/runs">
            <div className="p-4">
              <LiveRunDemo />
            </div>
          </BrowserFrame>
        }
      />

      <Section settings={{ background: 'sunken', spacing: 'compact' }}>
        <CodeTabs
          tabs={[
            { label: 'playwright.config.ts', code: reporterSnippet },
            { label: '.env', code: envSnippet },
            { label: 'GitHub Actions', code: ciSnippet },
          ]}
          caption="No upload step. Results stream while the run executes."
        />
      </Section>

      <FeatureGrid
        header={{ eyebrow: 'What you get', heading: 'Three things the HTML report cannot do', align: 'center' }}
        items={featureItems.map((item, i) => ({ ...item, icon: icons[i] }))}
      />

      <FeatureShowcase
        header={{ eyebrow: 'Run detail', heading: 'The whole run on one screen' }}
        bullets={['Summary, specs, errors and configuration', 'Filter by outcome without leaving the page']}
        visual={
          <BrowserFrame url="reports.example.com/acme/web/runs/481">
            <RunSummaryDemo />
          </BrowserFrame>
        }
        settings={{ background: 'sunken' }}
      />

      <FeatureShowcase
        header={{ eyebrow: 'Evidence', heading: 'Debug from the evidence, not the log' }}
        bullets={['Every attempt, with its steps and timings', 'Screenshots, video, visual diff and the trace']}
        mediaSide="left"
        visual={
          <BrowserFrame url="reports.example.com/acme/web/results/4f21">
            <ResultAttemptsDemo />
          </BrowserFrame>
        }
      />

      <FeatureShowcase
        header={{ eyebrow: 'Analytics', heading: 'Find flaky tests before they find you' }}
        visual={
          <BrowserFrame url="reports.example.com/acme/web">
            <FlakyTestsDemo />
          </BrowserFrame>
        }
        settings={{ background: 'sunken' }}
      />

      <FeatureShowcase
        header={{ eyebrow: 'Explorer', heading: 'Every test, with its history' }}
        mediaSide="left"
        visual={
          <BrowserFrame url="reports.example.com/acme/web/tests">
            <ExplorerTableDemo />
          </BrowserFrame>
        }
      />

      <Steps
        header={{ eyebrow: 'How it works', heading: 'Four moving parts, none of them yours to babysit' }}
        steps={[
          { title: 'The reporter runs inside CI', description: <p>One entry in the config. Git and CI metadata come along automatically.</p> },
          { title: 'Results stream to the ingest API', description: <p>Token-authenticated and batched.</p> },
          { title: 'Postgres and blob storage keep them', description: <p>Both are yours.</p> },
          { title: 'The UI updates live over SSE', description: <p>While the job is still running.</p> },
        ]}
        link={{ href: '/how-it-works', label: 'The architecture in detail' }}
        settings={{ background: 'sunken' }}
      />

      <StatsBand
        header={{ heading: 'Own the data' }}
        items={[
          { value: 'Your Postgres', label: 'Database' },
          { value: 'Your blob store', label: 'Artifacts' },
          { value: 'Your project', label: 'Hosting' },
          { value: 'MIT', label: 'Licence' },
        ]}
        settings={{ background: 'default' }}
      />

      <ComparisonTable
        header={{ heading: 'How it compares' }}
        columns={comparisonColumns}
        rows={comparisonRows}
        settings={{ background: 'sunken' }}
      />

      <Faq
        header={{ eyebrow: 'FAQ', heading: 'Questions engineers actually ask' }}
        items={faqItems.map((item) => ({ ...item, answer: <p>{item.answer}</p> }))}
      />

      <CtaBand
        heading="Point it at a Neon branch and run the demo."
        text={<p>Five minutes, one database, no account to create.</p>}
        links={[primaryCta, githubCta]}
        tone="accent"
      />

      <SiteFooter
        siteName={SITE_NAME}
        columns={footerColumns}
        legal={footerLegal}
        social={social}
        copyright="© {year} denkwerk. MIT licensed."
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Every Playwright run, kept.');
    await expect(canvas.getByRole('tab', { name: 'playwright.config.ts' })).toBeVisible();
    await expect(canvas.getByRole('table', { name: /how it compares/i })).toBeVisible();
  },
};
