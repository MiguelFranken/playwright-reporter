import type { Block } from 'payload';
import { demoOptions } from '../demos';
import { link } from '../fields/link';
import { sectionHeader } from '../fields/section-header';
import { sectionSettings } from '../fields/section-settings';
import { themedMedia } from '../fields/themed-media';

/**
 * Copy on one side, the product on the other, alternating down the page. The
 * visual is either a screenshot pair or a live demo; a demo is preferred
 * wherever the view does not need app chrome around it.
 */
export const FeatureShowcaseBlock: Block = {
  slug: 'featureShowcase',
  interfaceName: 'FeatureShowcaseBlock',
  labels: { singular: 'Feature showcase', plural: 'Feature showcases' },
  fields: [
    sectionHeader(),
    {
      name: 'bullets',
      type: 'array',
      maxRows: 5,
      fields: [{ name: 'text', type: 'text', required: true }],
    },
    {
      name: 'mediaSide',
      type: 'select',
      defaultValue: 'right',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Right', value: 'right' },
      ],
    },
    {
      name: 'visual',
      type: 'group',
      fields: [
        {
          name: 'kind',
          type: 'radio',
          defaultValue: 'media',
          options: [
            { label: 'Screenshot', value: 'media' },
            { label: 'Live demo', value: 'demo' },
          ],
          admin: { layout: 'horizontal' },
        },
        themedMedia({ condition: (_data, siblingData) => siblingData?.kind === 'media' }),
        {
          name: 'demo',
          type: 'select',
          options: demoOptions,
          admin: { condition: (_data, siblingData) => siblingData?.kind === 'demo' },
        },
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
      ],
    },
    link({ required: false }),
    sectionSettings(),
  ],
};
