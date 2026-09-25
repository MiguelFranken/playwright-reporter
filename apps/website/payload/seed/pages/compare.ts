import { paragraphs, prose } from '../lexical';
import { external, internal, GITHUB_URL, type PageData, type SeedContext } from '../types';

/**
 * Factual, never disparaging, and explicit about what we do not do — which is
 * the part that keeps the wrong leads away (WEBSITE.md §5.3).
 */
export function compare(ctx: SeedContext): PageData {
  return {
    title: 'Compare',
    slug: 'compare',
    _status: 'published',
    hero: {
      variant: 'centered',
      eyebrow: 'Comparison',
      heading: 'Against the HTML report, and against a hosted service',
      lead: paragraphs(
        'Feature by feature, including the rows where we do less. Every claim here is something you can check in the repository.',
      ),
    },
    layout: [
      {
        blockType: 'comparisonTable',
        header: { heading: null, align: 'start' },
        columns: [
          { label: 'Playwright HTML report' },
          { label: 'This reporter', highlight: true },
          { label: 'Hosted SaaS' },
        ],
        rows: [
          {
            capability: 'Survives the CI job',
            cells: [
              { state: 'no', note: 'An artifact you have to download' },
              { state: 'yes' },
              { state: 'yes' },
            ],
          },
          {
            capability: 'Live progress while the run executes',
            cells: [{ state: 'no' }, { state: 'yes', note: 'Over SSE' }, { state: 'yes' }],
          },
          {
            capability: 'History across runs',
            cells: [
              { state: 'no' },
              { state: 'yes', note: 'As much as your database holds' },
              { state: 'yes', note: 'Subject to your plan’s retention' },
            ],
          },
          {
            capability: 'Flaky-test detection',
            cells: [
              { state: 'partial', note: 'Within a single run only' },
              { state: 'yes', note: 'Within and across runs' },
              { state: 'yes' },
            ],
          },
          {
            capability: 'Reliability score per test',
            cells: [{ state: 'no' }, { state: 'yes' }, { state: 'yes' }],
          },
          {
            capability: 'Screenshots, video and attachments',
            cells: [{ state: 'yes' }, { state: 'yes' }, { state: 'yes' }],
          },
          {
            capability: 'Trace viewer',
            cells: [
              { state: 'yes', note: 'Bundled' },
              { state: 'yes', note: 'Embedded, served by your app' },
              { state: 'partial', note: 'Usually links out too' },
            ],
          },
          {
            capability: 'Visual diff for snapshot failures',
            cells: [{ state: 'yes' }, { state: 'yes' }, { state: 'yes' }],
          },
          {
            capability: 'Sharded runs merged into one view',
            cells: [
              { state: 'partial', note: 'Needs a merge step' },
              { state: 'yes', note: 'Merged as shards report' },
              { state: 'yes' },
            ],
          },
          {
            capability: 'Teams, roles and invitations',
            cells: [{ state: 'no' }, { state: 'yes' }, { state: 'yes' }],
          },
          {
            capability: 'Test management (cases, plans, manual runs)',
            cells: [{ state: 'no' }, { state: 'no' }, { state: 'partial', note: 'Varies by vendor' }],
          },
          {
            capability: 'Your data stays in your infrastructure',
            cells: [
              { state: 'yes' },
              { state: 'yes', note: 'Your Postgres, your blob store' },
              { state: 'no' },
            ],
          },
          {
            capability: 'Cost',
            cells: [
              { state: 'yes', note: 'Free' },
              { state: 'yes', note: 'A database and a Node host' },
              { state: 'no', note: 'Per seat or per run' },
            ],
          },
        ],
        footnote: paragraphs(
          'Checked against Playwright 1.63 and vendors’ public documentation. If a row is wrong, open an issue — this table is CMS content and can be corrected without a deploy.',
        ),
      },
      {
        blockType: 'content',
        settings: { background: 'sunken' },
        columns: [
          {
            width: 'half',
            richText: prose([
              { h2: 'What we do not do' },
              { ul: [
                'Test management: no test cases, no test plans, no manual runs',
                'Our own trace viewer — the Playwright one is better and already exists',
                'Requirements traceability, or anything that needs a ticketing integration',
                'Test generation, healing, or anything else that writes your tests for you',
              ] },
              { p: 'If you need those, a hosted product is the right answer and we would rather say so here than waste your afternoon.' },
            ]),
          },
          {
            width: 'half',
            richText: prose([
              { h2: 'When this is the right choice' },
              { ul: [
                'Your results already disappear with the CI job and you feel it',
                'Flaky tests are costing time and nobody can say which ones',
                'Sending test data to a third party is awkward or not allowed',
                'You would rather run one more Vercel project than buy a seat per engineer',
              ] },
            ]),
          },
        ],
      },
      {
        blockType: 'cta',
        heading: 'Read the code before you believe the table.',
        links: [
          { link: external(GITHUB_URL, 'View on GitHub', 'primary') },
          { link: internal(ctx, 'get-started', 'Get started', 'secondary') },
        ],
      },
    ],
    meta: {
      title: 'Compare',
      description:
        'How this reporter compares with the Playwright HTML report and with hosted services — including the rows where it deliberately does less.',
    },
  };
}
