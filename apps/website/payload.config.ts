import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob';
import { seoPlugin } from '@payloadcms/plugin-seo';
import { redirectsPlugin } from '@payloadcms/plugin-redirects';
import sharp from 'sharp';
import type { PayloadRequest } from 'payload';

import { admins, anyone } from './payload/access';
import { blocks } from './payload/blocks';
import { Media } from './payload/collections/media';
import { Pages } from './payload/collections/pages';
import { Users } from './payload/collections/users';
import { Footer } from './payload/globals/footer';
import { Header } from './payload/globals/header';
import { SiteSettings } from './payload/globals/site-settings';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const serverURL = process.env.BASE_URL ?? 'http://localhost:3001';

const FALLBACK_SITE_NAME = process.env.SITE_NAME ?? 'Playwright Reporter';

/**
 * The product name is CMS content (it is still a placeholder), so the SEO
 * plugin has to read it rather than close over an env var.
 */
async function siteName(req?: PayloadRequest): Promise<string> {
  if (!req?.payload) return FALLBACK_SITE_NAME;
  const settings = await req.payload.findGlobal({ slug: 'site-settings', depth: 0 });
  return settings?.siteName ?? FALLBACK_SITE_NAME;
}

export default buildConfig({
  serverURL,
  secret: process.env.PAYLOAD_SECRET ?? '',
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
    livePreview: {
      collections: ['pages'],
      breakpoints: [
        { label: 'Mobile', name: 'mobile', width: 375, height: 812 },
        { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
        { label: 'Desktop', name: 'desktop', width: 1440, height: 900 },
      ],
    },
  },
  collections: [Pages, Media, Users],
  globals: [Header, Footer, SiteSettings],
  blocks,
  // Per-field feature sets are set on the fields themselves (payload/fields).
  // This is only the fallback for a field that names no editor.
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    schemaName: process.env.PAYLOAD_SCHEMA ?? 'website',
    // Migrations only, even in development: this database is shared with the
    // reporter's own migration tooling, and the `website` schema has to be
    // created by a reviewable migration rather than by a push.
    push: false,
    migrationDir: path.resolve(dirname, 'payload/migrations'),
  }),
  sharp,
  plugins: [
    seoPlugin({
      collections: ['pages'],
      uploadsCollection: 'media',
      generateTitle: async ({ doc, req }) => `${doc?.title} · ${await siteName(req)}`,
      generateURL: ({ doc }) =>
        `${serverURL}${!doc?.slug || doc.slug === 'home' ? '' : `/${doc.slug}`}`,
    }),
    redirectsPlugin({
      collections: ['pages'],
      overrides: {
        admin: { group: 'Admin' },
        access: { read: anyone, create: admins, update: admins, delete: admins },
      },
    }),
    vercelBlobStorage({
      enabled: Boolean(process.env.WEBSITE_BLOB_READ_WRITE_TOKEN),
      collections: { media: { prefix: 'website' } },
      token: process.env.WEBSITE_BLOB_READ_WRITE_TOKEN ?? '',
    }),
  ],
  graphQL: { disable: true },
  maxDepth: 3,
  cors: [serverURL],
  csrf: [serverURL],
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
});
