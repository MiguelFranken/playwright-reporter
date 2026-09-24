import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CollectionConfig } from 'payload';
import { anyone, authenticated } from '../access';
import { inlineEditor } from '../fields/editors';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Screenshots, diagrams and the logo. Public by design — this is a marketing
 * site, not the reporter's artifact store, which stays private.
 *
 * In production the Vercel Blob plugin takes `staticDir` over; in development
 * files land in `.media/`, which is gitignored.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: { useAsTitle: 'filename', group: 'Content' },
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  upload: {
    staticDir: path.resolve(dirname, '../../.media'),
    mimeTypes: ['image/*', 'video/mp4'],
    focalPoint: true,
    imageSizes: [
      { name: 'thumbnail', width: 400, position: 'centre' },
      { name: 'card', width: 768, position: 'centre' },
      { name: 'showcase', width: 1440, position: 'centre' },
    ],
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'caption', type: 'richText', editor: inlineEditor },
    {
      name: 'theme',
      type: 'select',
      defaultValue: 'neutral',
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
        { label: 'Neutral', value: 'neutral' },
      ],
      // Lets the media library be filtered when picking a light/dark pair.
      admin: { position: 'sidebar' },
    },
  ],
};
