import type { Block } from 'payload';
import { sectionSettings } from '../fields/section-settings';
import { themedMedia } from '../fields/themed-media';

/** A screenshot or diagram on its own, optionally in a browser frame. */
export const MediaBlock: Block = {
  slug: 'mediaBlock',
  interfaceName: 'MediaBlock',
  labels: { singular: 'Media', plural: 'Media' },
  fields: [
    themedMedia({ required: true }),
    {
      type: 'row',
      fields: [
        {
          name: 'frame',
          type: 'select',
          defaultValue: 'browser',
          options: [
            { label: 'Browser frame', value: 'browser' },
            { label: 'Plain', value: 'plain' },
            { label: 'None', value: 'none' },
          ],
          admin: { width: '33%' },
        },
        {
          name: 'size',
          type: 'select',
          defaultValue: 'content',
          options: [
            { label: 'Content width', value: 'content' },
            { label: 'Wide', value: 'wide' },
            { label: 'Full bleed', value: 'full' },
          ],
          admin: { width: '33%' },
        },
        { name: 'caption', type: 'text', admin: { width: '34%' } },
      ],
    },
    sectionSettings(),
  ],
};
