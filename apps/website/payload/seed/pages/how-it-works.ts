import { paragraphs, prose } from '../lexical';
import { githubActions, reporterConfig } from '../snippets';
import { internal, type PageData, type SeedContext } from '../types';

/** For the platform engineer asked to evaluate the deployment (WEBSITE.md §2.1). */
export function howItWorks(ctx: SeedContext): PageData {
  return {
    title: 'How it works',
    slug: 'how-it-works',
    _status: 'published',
    hero: {
      variant: 'centered',
      eyebrow: 'Architecture',
      heading: 'A reporter, an ingest API, a database and a blob store',
      lead: paragraphs(
        'Four pieces, all of them ordinary. Nothing here needs a queue, a worker fleet or an agent on your runners.',
      ),
    },
    layout: [
      {
        blockType: 'steps',
        header: { heading: 'The path a result takes', align: 'start' },
        steps: [
          {
            title: 'The reporter, inside your CI job',
            description: paragraphs(
              'A standard Playwright reporter. It opens a run when the suite starts, streams results as they finish, and closes the run at the end — so a crashed job leaves an interrupted run rather than nothing at all.',
            ),
            code: { language: 'ts', code: reporterConfig },
          },
          {
            title: 'The ingest API',
            description: paragraphs(
              'A token-authenticated HTTP endpoint on your own deployment. The token identifies the project; there is no other way in. Payloads are batched, and a retried job resumes the run it already opened.',
            ),
            code: { language: 'yaml', code: githubActions },
          },
          {
            title: 'Postgres for the history',
            description: paragraphs(
              'Runs, shards, specs, results, attempts, steps and errors, in a normalised schema with the indexes the analytics queries need. Neon in the default deployment; any Postgres 15 or later otherwise.',
            ),
          },
          {
            title: 'Blob storage for the artifacts',
            description: paragraphs(
              'Screenshots, videos and traces go to a blob store, never into the database. They are served through signed URLs that expire, which is also how the Playwright trace viewer is allowed to read them.',
            ),
          },
          {
            title: 'The UI, updating live',
            description: paragraphs(
              'Pages are server-rendered. A run in flight opens a server-sent-events stream, so progress and counts change under you without a refresh and without polling.',
            ),
          },
        ],
      },
      {
        blockType: 'content',
        settings: { background: 'sunken' },
        columns: [
          {
            width: 'half',
            richText: prose([
              { h2: 'What it needs' },
              { ul: [
                'Postgres 15 or later, with a pooled and a direct connection string',
                'A blob store, or a writable directory when self-hosting',
                'A Node 24 host — Vercel, a container, or a server you already run',
              ] },
              { p: 'That is the whole dependency list. No Redis, no queue, no cron.' },
            ]),
          },
          {
            width: 'half',
            richText: prose([
              { h2: 'What it does not need' },
              { ul: [
                'An agent or daemon on your CI runners',
                'Outbound access to anything but your own deployment',
                'A separate database per project or team',
              ] },
              { p: 'Teams and projects are rows, not deployments.' },
            ]),
          },
        ],
      },
      {
        blockType: 'featureGrid',
        columns: '3',
        header: { heading: 'Operational notes', align: 'start' },
        items: [
          {
            icon: 'Timer',
            title: 'Retries and resumes',
            description: 'A re-run of the same CI job reopens the same run. Attempts accumulate; the run is not duplicated.',
          },
          {
            icon: 'Layers',
            title: 'Sharding',
            description: 'Shards are first-class. Each reports its own progress and the run merges them as they arrive.',
          },
          {
            icon: 'ShieldCheck',
            title: 'Access',
            description: 'Ingest is by project token. The UI is by session, scoped to the teams you belong to.',
          },
        ],
      },
      {
        blockType: 'cta',
        heading: 'Deploy it and point your suite at it.',
        links: [{ link: internal(ctx, 'get-started', 'Get started', 'primary') }],
      },
    ],
    meta: {
      title: 'How it works',
      description:
        'The architecture: a Playwright reporter streams into a token-authenticated ingest API, Postgres keeps the history, a blob store keeps the artifacts, and the UI updates over SSE.',
    },
  };
}
