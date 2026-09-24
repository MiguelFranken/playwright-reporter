import type { Block } from 'payload';
import { demoOptions } from '../demos';
import { sectionHeader } from '../fields/section-header';
import { sectionSettings } from '../fields/section-settings';

/** A design-system view, rendered live with fixture data. */
export const ProductDemoBlock: Block = {
  slug: 'productDemo',
  interfaceName: 'ProductDemoBlock',
  labels: { singular: 'Product demo', plural: 'Product demos' },
  fields: [
    sectionHeader(),
    { name: 'demo', type: 'select', options: demoOptions, required: true },
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
          ],
          admin: { width: '40%' },
        },
        { name: 'caption', type: 'text', admin: { width: '60%' } },
      ],
    },
    sectionSettings(),
  ],
};
