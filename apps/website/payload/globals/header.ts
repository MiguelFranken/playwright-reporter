import type { GlobalConfig } from 'payload';
import { anyone, authenticated } from '../access';
import { link, linkGroup } from '../fields/link';
import { revalidateLayout } from '../hooks/revalidate-global';

export const Header: GlobalConfig = {
  slug: 'header',
  admin: { group: 'Site' },
  access: { read: anyone, update: authenticated },
  hooks: { afterChange: [revalidateLayout] },
  fields: [
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Optional. Falls back to the site name set in Site settings.' },
    },
    {
      name: 'navItems',
      type: 'array',
      maxRows: 6,
      fields: [link()],
    },
    linkGroup({ max: 2, name: 'ctas' }),
    {
      type: 'row',
      fields: [
        { name: 'showGithub', type: 'checkbox', defaultValue: true, admin: { width: '50%' } },
        { name: 'showThemeToggle', type: 'checkbox', defaultValue: true, admin: { width: '50%' } },
      ],
    },
  ],
};
