import type { Block } from 'payload';
import { sectionHeader } from '../fields/section-header';
import { sectionSettings } from '../fields/section-settings';

/** Two to four short claims in a row — "your Postgres", "your blob store". */
export const StatsBandBlock: Block = {
  slug: 'statsBand',
  interfaceName: 'StatsBandBlock',
  labels: { singular: 'Stats band', plural: 'Stats bands' },
  fields: [
    sectionHeader(),
    {
      name: 'items',
      type: 'array',
      minRows: 2,
      maxRows: 4,
      required: true,
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'value', type: 'text', required: true, admin: { width: '33%' } },
            { name: 'label', type: 'text', required: true, admin: { width: '33%' } },
            { name: 'hint', type: 'text', admin: { width: '34%' } },
          ],
        },
      ],
    },
    sectionSettings(),
  ],
};
