import type { GlobalConfig } from 'payload';
import { anyone, authenticated } from '../access';
import { link } from '../fields/link';
import { revalidateLayout } from '../hooks/revalidate-global';

export const Footer: GlobalConfig = {
  slug: 'footer',
  admin: { group: 'Site' },
  access: { read: anyone, update: authenticated },
  hooks: { afterChange: [revalidateLayout] },
  fields: [
    {
      name: 'columns',
      type: 'array',
      maxRows: 4,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'links', type: 'array', fields: [link()] },
      ],
    },
    { name: 'legal', type: 'array', fields: [link()] },
    {
      name: 'copyright',
      type: 'text',
      admin: { description: 'Use {year} for the current year.' },
    },
    {
      name: 'social',
      type: 'array',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'platform',
              type: 'select',
              required: true,
              options: ['github', 'x', 'linkedin', 'bluesky'].map((value) => ({
                label: value,
                value,
              })),
              admin: { width: '30%' },
            },
            { name: 'url', type: 'text', required: true, admin: { width: '70%' } },
          ],
        },
      ],
    },
  ],
};
