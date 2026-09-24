import type { GlobalConfig } from 'payload';
import { anyone, authenticated } from '../access';
import { link } from '../fields/link';
import { revalidateLayout } from '../hooks/revalidate-global';

/**
 * Everything the site needs to know about itself. The product name lives here
 * rather than in code because it is still a placeholder: renaming the product
 * is a content edit plus a logo upload, not a deploy.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  admin: { group: 'Site' },
  access: { read: anyone, update: authenticated },
  hooks: { afterChange: [revalidateLayout] },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'siteName', type: 'text', required: true, admin: { width: '50%' } },
        { name: 'tagline', type: 'text', admin: { width: '50%' } },
      ],
    },
    { name: 'description', type: 'textarea', admin: { description: 'Default meta description.' } },
    {
      type: 'row',
      fields: [
        { name: 'githubUrl', type: 'text', admin: { width: '50%' } },
        {
          name: 'docsUrl',
          type: 'text',
          admin: { width: '50%', description: 'Placeholder until the docs site exists.' },
        },
      ],
    },
    { name: 'defaultOgImage', type: 'upload', relationTo: 'media' },
    {
      name: 'announcement',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox' },
        {
          name: 'text',
          type: 'text',
          admin: { condition: (_data, siblingData) => Boolean(siblingData?.enabled) },
        },
        link({ required: false, condition: (_data, siblingData) => Boolean(siblingData?.enabled) }),
      ],
    },
    {
      name: 'analytics',
      type: 'group',
      admin: { description: 'Modelled now, wired up once the privacy notice is final.' },
      fields: [
        {
          name: 'provider',
          type: 'select',
          defaultValue: 'none',
          options: ['none', 'plausible', 'umami'].map((value) => ({ label: value, value })),
        },
        {
          type: 'row',
          admin: { condition: (_data, siblingData) => siblingData?.provider !== 'none' },
          fields: [
            { name: 'domain', type: 'text', admin: { width: '50%' } },
            { name: 'scriptUrl', type: 'text', admin: { width: '50%' } },
          ],
        },
      ],
    },
  ],
};
