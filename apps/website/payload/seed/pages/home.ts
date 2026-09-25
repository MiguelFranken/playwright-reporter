import { paragraphs } from '../lexical';
import { githubActions, reporterConfig, reporterEnv } from '../snippets';
import { external, internal, GITHUB_URL, type PageData, type SeedContext } from '../types';

/**
 * The home page is the site; every other page is a deeper cut of one of its
 * sections (WEBSITE.md §4). The order here is the order a visitor reads:
 * claim, proof, setup, capabilities, architecture, ownership, comparison,
 * honest answers, ask.
 */
export function home(ctx: SeedContext): PageData {
  return {
    title: 'Home',
    slug: 'home',
    _status: 'published',
    hero: {
      variant: 'split',
      eyebrow: 'Self-hosted · Open source',
      heading: 'Every Playwright run, kept.',
      lead: paragraphs(
        'A self-hosted home for your Playwright runs: live progress while CI is still executing, every failure with its trace, video and history, and the flaky tests ranked before they cost you a morning.',
      ),
      links: [
        { link: internal(ctx, 'get-started', 'Get started', 'primary') },
        { link: external(GITHUB_URL, 'View on GitHub', 'secondary') },
      ],
      // The live demo beats any screenshot: it is the app's own view, running.
      demo: 'active-runs',
    },
    layout: [
      {
        blockType: 'codeBlock',
        settings: { background: 'sunken', spacing: 'compact' },
        header: { heading: null, align: 'start' },
        caption: 'No upload step. Results stream while the run executes.',
        tabs: [
          { label: 'playwright.config.ts', language: 'ts', code: reporterConfig },
          { label: '.env', language: 'env', code: reporterEnv },
          { label: 'GitHub Actions', language: 'yaml', code: githubActions },
        ],
      },
      {
        blockType: 'featureGrid',
        columns: '3',
        header: {
          eyebrow: 'What you get',
          heading: 'Three things the HTML report cannot do',
          align: 'center',
        },
        items: [
          {
            icon: 'Radio',
            title: 'Watch runs live',
            description:
              'Progress, counts and per-shard state update over SSE while the job is still running. You know a run is going badly before it finishes.',
          },
          {
            icon: 'Bug',
            title: 'Debug from the evidence',
            description:
              'Error and stack, every step with its timing, screenshots, video, the visual diff, and a signed link into the Playwright trace viewer.',
          },
          {
            icon: 'Repeat2',
            title: 'Find flaky tests early',
            description:
              'Flaky detection within a run and across runs, a reliability score per test, chronic failures, and a history sparkline on every row.',
          },
        ],
      },
      {
        blockType: 'featureShowcase',
        settings: { background: 'sunken' },
        mediaSide: 'right',
        header: {
          eyebrow: 'Run detail',
          heading: 'The whole run on one screen',
          align: 'start',
        },
        bullets: [
          { text: 'Summary, specs, errors and configuration as tabs' },
          { text: 'Filter by outcome without leaving the page' },
          { text: 'Errors grouped by signature, so fourteen failures read as three causes' },
        ],
        visual: { kind: 'demo', demo: 'run-summary', frame: 'browser' },
        link: internal(ctx, 'features', 'See every feature'),
      },
      {
        blockType: 'featureShowcase',
        mediaSide: 'left',
        header: {
          eyebrow: 'Evidence',
          heading: 'Debug from the evidence, not the log',
          align: 'start',
        },
        bullets: [
          { text: 'Every attempt, with its steps and their timings' },
          { text: 'Screenshots, video and the visual diff, inline' },
          { text: 'The trace opens in the Playwright Trace Viewer, embedded and served by the app' },
        ],
        visual: { kind: 'demo', demo: 'result-attempts', frame: 'browser' },
      },
      {
        blockType: 'featureShowcase',
        settings: { background: 'sunken' },
        mediaSide: 'right',
        header: {
          eyebrow: 'Analytics',
          heading: 'Find flaky tests before they find you',
          align: 'start',
        },
        bullets: [
          { text: 'A reliability score that weighs failures fully and flakiness half' },
          { text: 'Chronic failures listed apart from the merely flaky' },
          { text: 'Pass rate over time, per branch and per environment' },
        ],
        visual: { kind: 'demo', demo: 'flaky-tests', frame: 'browser' },
      },
      {
        blockType: 'featureShowcase',
        mediaSide: 'left',
        header: {
          eyebrow: 'Test Explorer',
          heading: 'Every test, with its history',
          align: 'start',
        },
        bullets: [
          { text: 'Search and sort across every test the project has reported' },
          { text: 'A drawer with the last thirty outcomes and the errors behind them' },
        ],
        visual: { kind: 'demo', demo: 'explorer-table', frame: 'browser' },
      },
      {
        blockType: 'steps',
        settings: { background: 'sunken' },
        header: {
          eyebrow: 'How it works',
          heading: 'Four moving parts, none of them yours to babysit',
          align: 'start',
        },
        steps: [
          {
            title: 'The reporter runs inside CI',
            description: paragraphs(
              'One entry in playwright.config.ts. Branch, commit, author, pull request, CI build and shard index are read from the environment, so nothing has to be passed in by hand.',
            ),
          },
          {
            title: 'Results stream to the ingest API',
            description: paragraphs(
              'Token-authenticated and batched, as the run produces them. A retried job resumes the same run rather than starting a second one.',
            ),
          },
          {
            title: 'Postgres keeps the history, blob storage keeps the artifacts',
            description: paragraphs(
              'Both are yours: a Neon branch and a Vercel Blob store in the default deployment, any Postgres and any writable directory otherwise.',
            ),
          },
          {
            title: 'The UI updates live over SSE',
            description: paragraphs(
              'Active runs, counts and shard state, while the job is still executing. No polling, no refresh button.',
            ),
          },
        ],
        link: internal(ctx, 'how-it-works', 'The architecture in detail'),
      },
      {
        blockType: 'statsBand',
        header: { heading: 'Own the data', align: 'start' },
        items: [
          { value: 'Your Postgres', label: 'Database', hint: 'Neon, RDS, or a server you already run' },
          { value: 'Your blob store', label: 'Artifacts', hint: 'Vercel Blob, or the local disk' },
          { value: 'Your project', label: 'Hosting', hint: 'Vercel, or any Node host' },
          { value: 'MIT', label: 'Licence', hint: 'Fork it, run it, change it' },
        ],
      },
      {
        blockType: 'featureShowcase',
        settings: { background: 'sunken' },
        mediaSide: 'right',
        header: {
          eyebrow: 'Teams',
          heading: 'Teams, not tenants',
          align: 'start',
        },
        bullets: [
          { text: 'Teams with admin, member and viewer roles' },
          { text: 'Invitations by email, and a superadmin above them' },
          { text: 'An audit log of who changed what' },
        ],
        visual: {
          kind: 'media',
          media: { light: ctx.media['settings-reporter.light'], dark: ctx.media['settings-reporter.dark'] },
          frame: 'browser',
        },
      },
      {
        blockType: 'comparisonTable',
        header: { heading: 'How it compares', align: 'start' },
        columns: [
          { label: 'Playwright HTML report' },
          { label: 'This reporter', highlight: true },
          { label: 'Hosted SaaS' },
        ],
        rows: [
          {
            capability: 'Survives the CI job',
            cells: [{ state: 'no' }, { state: 'yes' }, { state: 'yes' }],
          },
          {
            capability: 'History across runs',
            cells: [
              { state: 'no' },
              { state: 'yes', note: 'As much as your database holds' },
              { state: 'yes', note: 'Per plan' },
            ],
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
              { state: 'partial', note: 'Usually links out too' },
            ],
          },
          {
            capability: 'You own the data',
            cells: [
              { state: 'yes' },
              { state: 'yes', note: 'Your Postgres, your blob store' },
              { state: 'no' },
            ],
          },
        ],
        footnote: paragraphs('The full table, row by row, is on the comparison page.'),
      },
      {
        blockType: 'faq',
        settings: { background: 'sunken' },
        header: { eyebrow: 'FAQ', heading: 'Questions engineers actually ask', align: 'start' },
        items: [
          {
            question: 'Does it replace the Playwright trace viewer?',
            answer: paragraphs(
              'No, and it does not try to. It embeds the Playwright Trace Viewer, the tool you already know, served from your own deployment, so traces never reach a third party.',
            ),
          },
          {
            question: 'What does it cost to run?',
            answer: paragraphs(
              'A Postgres database and a place to run a Next.js app. On a Neon free branch and a Vercel hobby project, nothing.',
            ),
          },
          {
            question: 'Which CI providers work?',
            answer: paragraphs(
              'All of them. The reporter reads the usual environment variables for GitHub Actions, GitLab CI, CircleCI, Buildkite and Jenkins, and falls back to git for anything else.',
            ),
          },
          {
            question: 'Does it work with shards?',
            answer: paragraphs(
              'Yes. Each shard reports separately and the run merges them as they arrive, so the progress bar is the whole suite rather than one worker.',
            ),
          },
          {
            question: 'Where are the artifacts stored?',
            answer: paragraphs(
              'In your blob store. Vercel Blob in the default deployment, or a directory on disk when you self-host. They are served through signed, expiring URLs.',
            ),
          },
          {
            question: 'Can I run it without Vercel?',
            answer: paragraphs(
              'Yes. It is a standard Next.js app and a Postgres database. Vercel is the shortest path, not a requirement.',
            ),
          },
          {
            question: 'What is it not?',
            answer: paragraphs(
              'It is not a test-management tool: no test cases, no plans, no manual runs. And it is not a trace viewer of its own.',
            ),
          },
        ],
      },
      {
        blockType: 'cta',
        tone: 'accent',
        heading: 'Point it at a Neon branch and run the demo.',
        text: paragraphs('Five minutes, one database, and no account to create.'),
        links: [
          { link: internal(ctx, 'get-started', 'Get started', 'primary') },
          { link: external(GITHUB_URL, 'View on GitHub', 'secondary') },
        ],
      },
    ],
    meta: {
      title: 'Every Playwright run, kept',
      description:
        'A self-hosted home for Playwright test runs: live progress, full debugging evidence and flaky-test analytics, on your own Postgres and blob storage.',
    },
  };
}
