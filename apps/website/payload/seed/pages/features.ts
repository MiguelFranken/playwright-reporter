import { paragraphs } from '../lexical';
import { external, internal, GITHUB_URL, type PageData, type SeedContext } from '../types';

/** The deeper cut of the home page's showcase section: one section per capability. */
export function features(ctx: SeedContext): PageData {
  return {
    title: 'Features',
    slug: 'features',
    _status: 'published',
    hero: {
      variant: 'centered',
      eyebrow: 'Features',
      heading: 'Everything a run leaves behind, kept and searchable',
      lead: paragraphs(
        'The reporter records what happened; this is what you can do with it afterwards. Every screen below is the real interface, running on sample data.',
      ),
      links: [{ link: internal(ctx, 'get-started', 'Get started', 'primary') }],
    },
    layout: [
      {
        blockType: 'featureShowcase',
        mediaSide: 'right',
        header: {
          eyebrow: 'Live runs',
          heading: 'Watch a run as CI executes it',
          align: 'start',
        },
        bullets: [
          { text: 'A card per active run, with progress against the expected test count' },
          { text: 'One segment per shard, so a stuck worker is visible immediately' },
          { text: 'Server-sent events, so the page updates without polling' },
        ],
        visual: { kind: 'demo', demo: 'active-runs', frame: 'browser' },
      },
      {
        blockType: 'featureShowcase',
        settings: { background: 'sunken' },
        mediaSide: 'left',
        header: {
          eyebrow: 'Run history',
          heading: 'Every report the project has received',
          align: 'start',
        },
        bullets: [
          { text: 'Newest first, with branch, commit, author, pull request and environment' },
          { text: 'Search by commit message, branch or run number' },
          { text: 'Filter by status and by date range' },
        ],
        visual: { kind: 'demo', demo: 'runs-table', frame: 'browser' },
      },
      {
        blockType: 'featureShowcase',
        mediaSide: 'right',
        header: {
          eyebrow: 'Run detail',
          heading: 'Summary, specs, errors, configuration',
          align: 'start',
        },
        bullets: [
          { text: 'Counts as a bar, and as filters' },
          { text: 'Errors grouped by signature, with a sample result per group' },
          { text: 'The full resolved Playwright config, as the run actually used it' },
        ],
        visual: { kind: 'demo', demo: 'run-summary', frame: 'browser' },
      },
      {
        blockType: 'featureShowcase',
        settings: { background: 'sunken' },
        mediaSide: 'left',
        header: {
          eyebrow: 'Test result',
          heading: 'Attempts, steps and evidence',
          align: 'start',
        },
        bullets: [
          { text: 'One panel per attempt, opening on the error when there is one' },
          { text: 'Steps with their timings, so a slow test explains itself' },
          { text: 'Screenshots, video, visual diff and attachments, inline' },
          { text: 'A signed link into the Playwright trace viewer' },
        ],
        visual: { kind: 'demo', demo: 'result-attempts', frame: 'browser' },
      },
      {
        blockType: 'featureShowcase',
        mediaSide: 'right',
        header: {
          eyebrow: 'Dashboard',
          heading: 'How the suite has behaved',
          align: 'start',
        },
        bullets: [
          { text: 'Runs, pass rate, reliability score and median duration' },
          { text: 'Pass rate over time, as outcomes or as a percentage' },
          { text: 'A row per branch, with its last run and its pass rate' },
        ],
        visual: { kind: 'demo', demo: 'pass-fail-chart', frame: 'browser' },
      },
      {
        blockType: 'featureShowcase',
        settings: { background: 'sunken' },
        mediaSide: 'left',
        header: {
          eyebrow: 'Flakiness',
          heading: 'The tests that waste the most time, ranked',
          align: 'start',
        },
        bullets: [
          { text: 'Flaky within a run (passed on retry) and across runs (same commit, different outcome)' },
          { text: 'Chronic failures kept apart from the merely flaky' },
          { text: 'A reliability score per test: failures weigh fully, flakiness half' },
        ],
        visual: { kind: 'demo', demo: 'flaky-tests', frame: 'browser' },
      },
      {
        blockType: 'featureShowcase',
        mediaSide: 'right',
        header: {
          eyebrow: 'Test Explorer',
          heading: 'Every test, with its own history',
          align: 'start',
        },
        bullets: [
          { text: 'Sort by reliability, flakiness, failure rate or last run' },
          { text: 'A drawer with the last thirty outcomes and the errors behind them' },
          { text: 'Sibling projects side by side, so a webkit-only failure is obvious' },
        ],
        visual: { kind: 'demo', demo: 'explorer-table', frame: 'browser' },
      },
      {
        blockType: 'featureGrid',
        settings: { background: 'sunken' },
        columns: '3',
        header: { heading: 'And the rest of it', align: 'start' },
        items: [
          {
            icon: 'Users',
            title: 'Teams and roles',
            description: 'Teams with admin, member and viewer roles, email invitations, and a superadmin above them.',
          },
          {
            icon: 'KeyRound',
            title: 'Project tokens',
            description: 'One token per project, rotatable, with the ingest API accepting nothing else.',
          },
          {
            icon: 'GitBranch',
            title: 'Git and CI metadata',
            description: 'Branch, commit, author, pull request, build number and build URL, captured without configuration.',
          },
          {
            icon: 'Layers',
            title: 'Shards',
            description: 'Each shard reports separately; the run merges them as they land.',
          },
          {
            icon: 'Database',
            title: 'Audit log',
            description: 'Who invited whom, who changed a role, who rotated a token.',
          },
          {
            icon: 'Cloud',
            title: 'Pluggable storage',
            description: 'Vercel Blob or the local disk, chosen by an environment variable.',
          },
        ],
      },
      {
        blockType: 'cta',
        heading: 'Try it against your own suite.',
        text: paragraphs('The setup is one reporter entry and two environment variables.'),
        links: [
          { link: internal(ctx, 'get-started', 'Get started', 'primary') },
          { link: external(GITHUB_URL, 'View on GitHub', 'secondary') },
        ],
      },
    ],
    meta: {
      title: 'Features',
      description:
        'Live runs, full debugging evidence, flaky-test analytics, a test explorer with history, teams and roles — every screen, on sample data.',
    },
  };
}
