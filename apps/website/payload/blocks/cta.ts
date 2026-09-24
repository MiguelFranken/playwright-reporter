import type { Block } from 'payload';
import { inlineEditor } from '../fields/editors';
import { linkGroup } from '../fields/link';
import { sectionSettings } from '../fields/section-settings';

/** The band that closes a page. */
export const CtaBlock: Block = {
  slug: 'cta',
  interfaceName: 'CtaBlock',
  labels: { singular: 'Call to action', plural: 'Calls to action' },
  fields: [
    { name: 'heading', type: 'text', required: true },
    { name: 'text', type: 'richText', editor: inlineEditor },
    linkGroup({ max: 2 }),
    {
      name: 'tone',
      type: 'select',
      defaultValue: 'default',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Accent', value: 'accent' },
      ],
    },
    sectionSettings(),
  ],
};
