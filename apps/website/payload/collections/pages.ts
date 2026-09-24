import type { CollectionConfig } from 'payload';
import { authenticated, authenticatedOrPublished } from '../access';
import { blockSlugs } from '../blocks';
import { demoOptions } from '../demos';
import { codeSnippet } from '../fields/code';
import { inlineEditor } from '../fields/editors';
import { linkGroup } from '../fields/link';
import { pageSlugField } from '../fields/slug';
import { themedMedia } from '../fields/themed-media';
import { populatePublishedAt } from '../hooks/populate-published-at';
import { pathForSlug, revalidatePage, revalidatePageAfterDelete } from '../hooks/revalidate-page';

const serverURL = process.env.BASE_URL ?? 'http://localhost:3001';

function previewURL(slug: string | null | undefined): string {
  const params = new URLSearchParams({
    slug: slug ?? 'home',
    collection: 'pages',
    secret: process.env.PREVIEW_SECRET ?? '',
  });
  return `${serverURL}/next/preview?${params.toString()}`;
}

/**
 * Every route on the site except `/admin`. The hero is a group rather than a
 * block because a page has at most one and it is always first; everything
 * below it is `layout`, an ordered list of blocks the editor arranges.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    group: 'Content',
    livePreview: { url: ({ data }) => previewURL(data?.slug as string | undefined) },
    preview: (doc) => previewURL(doc?.slug as string | undefined),
  },
  access: {
    read: authenticatedOrPublished,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  versions: {
    drafts: { autosave: { interval: 300 }, schedulePublish: true },
    maxPerDoc: 50,
  },
  hooks: {
    beforeChange: [populatePublishedAt],
    afterChange: [revalidatePage],
    afterDelete: [revalidatePageAfterDelete],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Hero',
          fields: [
            {
              name: 'hero',
              type: 'group',
              fields: [
                {
                  name: 'variant',
                  type: 'select',
                  defaultValue: 'centered',
                  options: [
                    { label: 'None', value: 'none' },
                    { label: 'Centered', value: 'centered' },
                    { label: 'Split (copy + visual)', value: 'split' },
                  ],
                },
                {
                  type: 'collapsible',
                  label: 'Hero content',
                  admin: { condition: (_data, siblingData) => siblingData?.variant !== 'none' },
                  fields: [
                    { name: 'eyebrow', type: 'text' },
                    { name: 'heading', type: 'text' },
                    { name: 'lead', type: 'richText', editor: inlineEditor },
                    linkGroup({ max: 2 }),
                    // A demo wins over an image when both are set: it is the
                    // stronger proof and it never goes stale.
                    { name: 'demo', type: 'select', options: demoOptions },
                    themedMedia(),
                    codeSnippet({ name: 'snippet' }),
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Layout',
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blockReferences: blockSlugs,
              blocks: [],
              required: true,
              admin: { initCollapsed: true },
            },
          ],
        },
      ],
    },
    pageSlugField(),
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
};

export { pathForSlug };
