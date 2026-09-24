/**
 * Creates the CMS admin, the media library, the globals and the five content
 * pages — everything needed for the site to be complete on the day it is
 * deployed (WEBSITE.md §9.1).
 *
 *   pnpm --filter @repo/website db:seed
 *   pnpm --filter @repo/website db:seed --reset
 *
 * Idempotent: it exits when a page with the slug `home` already exists, unless
 * `--reset` is passed, which deletes pages and media but never users.
 */
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getPayload, type Payload } from 'payload';
// Type-only, so these are erased and may be imported before dotenv has run.
import type { MediaIds, PageIds, SeedContext } from './types';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(dirname, '../..');

dotenv.config({ path: [path.join(appRoot, '.env.local'), path.join(appRoot, '.env')], quiet: true });

const { default: config } = await import('../../payload.config');
const { compare } = await import('./pages/compare');
const { features } = await import('./pages/features');
const { getStarted } = await import('./pages/get-started');
const { home } = await import('./pages/home');
const { howItWorks } = await import('./pages/how-it-works');
const { imprint, privacy } = await import('./pages/legal');
const globals = await import('./globals');

const reset = process.argv.includes('--reset');
const screenshotDir = path.join(dirname, 'screenshots');

/**
 * Every write passes `context: { disableRevalidate: true }`, so the collection
 * hooks do not call `revalidatePath` once per page from a plain Node process.
 * One revalidation at the end covers the lot.
 */
const context = { disableRevalidate: true };

async function main() {
  const payload = await getPayload({ config });

  const existing = await payload.find({
    collection: 'pages',
    where: { slug: { equals: 'home' } },
    limit: 1,
    pagination: false,
  });

  if (existing.docs.length > 0 && !reset) {
    payload.logger.info('The site is already seeded. Pass --reset to rebuild it.');
    return;
  }

  if (reset) {
    payload.logger.info('Resetting pages and media…');
    await payload.delete({ collection: 'pages', where: {}, context });
    await payload.delete({ collection: 'media', where: {}, context });
  }

  await seedAdmin(payload);
  const media = await seedMedia(payload);
  const pages = await seedPages(payload, media);

  payload.logger.info(`Seeded ${Object.keys(pages).length} pages and ${Object.keys(media).length} media files.`);
}

/** The first CMS user. Separate from the reporter's own users, by design. */
async function seedAdmin(payload: Payload) {
  const email = process.env.SEED_WEBSITE_ADMIN_EMAIL ?? 'admin@example.com';

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    pagination: false,
  });

  if (existing.docs.length > 0) {
    payload.logger.info(`CMS admin ${email} already exists.`);
    return;
  }

  // Printed once, never stored: the same contract as the reporter's own seed.
  // An empty value in `.env.local` counts as unset, not as an empty password.
  const configured = process.env.SEED_WEBSITE_ADMIN_PASSWORD?.trim();
  const password = configured || randomBytes(18).toString('base64url');

  await payload.create({
    collection: 'users',
    data: { email, password, name: 'Website admin', role: 'admin' },
    context,
  });

  payload.logger.info(`Created CMS admin ${email}`);
  if (!configured) {
    payload.logger.info(`Generated password (shown once): ${password}`);
  }
}

/**
 * Uploads the committed screenshot pairs. The file name carries the theme
 * (`dashboard.light.png`), which becomes the `theme` field so the media
 * library can be filtered when an editor picks a pair.
 */
async function seedMedia(payload: Payload): Promise<MediaIds> {
  const ids: MediaIds = {};

  let files: string[];
  try {
    files = (await readdir(screenshotDir)).filter((file) => file.endsWith('.png')).sort();
  } catch {
    payload.logger.warn('No screenshots found. Run `pnpm --filter @repo/website screenshots` first.');
    return ids;
  }

  for (const file of files) {
    const key = file.replace(/\.png$/, '');
    const [name, theme = 'neutral'] = key.split('.');

    const existing = await payload.find({
      collection: 'media',
      where: { filename: { equals: file } },
      limit: 1,
      pagination: false,
    });

    if (existing.docs[0]) {
      ids[key] = existing.docs[0].id;
      continue;
    }

    const data = await readFile(path.join(screenshotDir, file));
    const doc = await payload.create({
      collection: 'media',
      data: {
        alt: `${describe(name ?? key)} — ${theme} theme`,
        theme: theme === 'light' || theme === 'dark' ? theme : 'neutral',
      },
      file: { name: file, data, mimetype: 'image/png', size: data.byteLength },
      context,
    });

    ids[key] = doc.id;
  }

  return ids;
}

const DESCRIPTIONS: Record<string, string> = {
  dashboard: 'The dashboard, with the reliability score and the pass-rate trend',
  runs: 'The run list, with an active run at the top',
  'run-detail': 'A run’s detail screen, on the Summary tab',
  explorer: 'The test explorer, sorted by last run',
  'result-attempts': 'A flaky test result, with its three attempts',
  'settings-reporter': 'The project settings screen, showing the reporter snippet',
};

function describe(name: string): string {
  return DESCRIPTIONS[name] ?? name;
}

/**
 * Two passes, because internal links store a relationship rather than a path:
 * the pages must all exist before the links between them can be written.
 */
async function seedPages(payload: Payload, media: MediaIds): Promise<PageIds> {
  const builders = [home, features, howItWorks, getStarted, compare, imprint, privacy];
  const pages: PageIds = {};
  const bare: SeedContext = { pages: {}, media };

  // Pass one creates every page as a draft with its links unresolved — the
  // `layout` field is required, so an empty placeholder would not validate.
  for (const build of builders) {
    const data = build(bare);
    const created = await payload.create({
      collection: 'pages',
      data: { ...data, _status: 'draft' },
      context,
    });
    pages[data.slug] = created.id;
  }

  // Pass two rewrites them with the references resolved, and publishes.

  const ctx: SeedContext = { pages, media };

  for (const build of builders) {
    const data = build(ctx);
    await payload.update({
      collection: 'pages',
      id: pages[data.slug]!,
      data,
      context,
    });
  }

  await payload.updateGlobal({ slug: 'site-settings', data: globals.siteSettings(), context });
  await payload.updateGlobal({ slug: 'header', data: globals.header(ctx), context });
  await payload.updateGlobal({ slug: 'footer', data: globals.footer(ctx), context });

  return pages;
}

await main();
process.exit(0);
