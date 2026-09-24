import type { Block } from 'payload';
import { proseEditor } from '../fields/prose';
import { sectionSettings } from '../fields/section-settings';

/** Free-form prose in one to three columns. The legal pages are one of these. */
export const ContentBlock: Block = {
  slug: 'content',
  interfaceName: 'ContentBlock',
  labels: { singular: 'Content', plural: 'Content' },
  fields: [
    {
      name: 'columns',
      type: 'array',
      minRows: 1,
      maxRows: 3,
      required: true,
      fields: [
        {
          name: 'width',
          type: 'select',
          defaultValue: 'full',
          options: [
            { label: 'Full', value: 'full' },
            { label: 'Half', value: 'half' },
            { label: 'Third', value: 'third' },
          ],
        },
        { name: 'richText', type: 'richText', editor: proseEditor },
      ],
    },
    sectionSettings(),
  ],
};
