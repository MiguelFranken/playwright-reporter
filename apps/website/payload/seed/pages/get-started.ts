import { paragraphs, prose } from '../lexical';
import {
  cloneAndRun,
  deployToVercel,
  envSetup,
  githubActions,
  migrateAndSeed,
  reporterConfig,
  reporterEnv,
  runTheDemo,
} from '../snippets';
import { external, internal, DOCS_URL, GITHUB_URL, type PageData, type SeedContext } from '../types';

/** Clone-and-run in five steps, then deploy. Every command is copyable. */
export function getStarted(ctx: SeedContext): PageData {
  return {
    title: 'Get started',
    slug: 'get-started',
    _status: 'published',
    hero: {
      variant: 'centered',
      eyebrow: 'Five minutes',
      heading: 'Point it at a Neon branch and run the demo',
      lead: paragraphs(
        'Clone the repository, give it a database, run the bundled example suite. Nothing to sign up for.',
      ),
      links: [{ link: external(GITHUB_URL, 'View on GitHub', 'secondary') }],
    },
    layout: [
      {
        blockType: 'steps',
        header: { heading: 'Run it locally', align: 'start' },
        steps: [
          {
            title: 'Clone and install',
            description: paragraphs('Node 24 and pnpm 10. The repository is a Turborepo with the app, the reporter and the design system in it.'),
            code: { language: 'bash', code: cloneAndRun },
          },
          {
            title: 'Create a database and fill in the environment',
            description: paragraphs(
              'A free Neon branch is enough. You need both the pooled and the direct connection string: the app uses the first, migrations the second.',
            ),
            code: { language: 'bash', code: envSetup },
          },
          {
            title: 'Migrate and seed',
            description: paragraphs(
              'The seed creates the first superadmin and prints its password once. Change it after the first sign-in.',
            ),
            code: { language: 'bash', code: migrateAndSeed },
          },
          {
            title: 'Run the example suite',
            description: paragraphs(
              'The bundled demo project reports into your local instance. Open the runs page while it executes — that is the live view, on your own data.',
            ),
            code: { language: 'bash', code: runTheDemo },
          },
          {
            title: 'Deploy it',
            description: paragraphs(
              'One Vercel project, the same two connection strings, and a blob store. Migrations run in the build step.',
            ),
            code: { language: 'bash', code: deployToVercel },
          },
        ],
        link: external(DOCS_URL, 'Full documentation'),
      },
      {
        blockType: 'codeBlock',
        settings: { background: 'sunken' },
        header: { heading: 'Point your own suite at it', align: 'start' },
        caption:
          'The token comes from the project settings page. Everything else — branch, commit, CI build, shard index — is read from the environment.',
        tabs: [
          { label: 'playwright.config.ts', language: 'ts', code: reporterConfig },
          { label: '.env', language: 'env', code: reporterEnv },
          { label: 'GitHub Actions', language: 'yaml', code: githubActions },
        ],
      },
      {
        blockType: 'content',
        columns: [
          {
            width: 'half',
            richText: prose([
              { h2: 'Requirements' },
              { ul: [
                'Node 24 or later',
                'pnpm 10',
                'Postgres 15 or later (Neon, or your own)',
                'A blob store for artifacts, or a writable directory',
              ] },
            ]),
          },
          {
            width: 'half',
            richText: prose([
              { h2: 'If something goes wrong' },
              { ul: [
                'Migrations must use the direct connection string, not the pooled one',
                'The ingest API rejects everything without a valid project token',
                'Artifacts need the storage driver set before the first run, or they upload nowhere',
              ] },
              { p: 'The repository README covers each of these in more detail.' },
            ]),
          },
        ],
      },
      {
        blockType: 'cta',
        settings: { background: 'sunken' },
        tone: 'accent',
        heading: 'Stuck, or curious how it is built?',
        text: paragraphs('The whole thing is one repository, MIT licensed.'),
        links: [
          { link: external(GITHUB_URL, 'View on GitHub', 'primary') },
          { link: internal(ctx, 'how-it-works', 'How it works', 'secondary') },
        ],
      },
    ],
    meta: {
      title: 'Get started',
      description:
        'Clone the repository, point it at a Postgres database, run the bundled Playwright demo, and deploy it to Vercel. Every command is copyable.',
    },
  };
}
