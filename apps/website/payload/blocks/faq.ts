import type { Block } from 'payload';
import { inlineListEditor } from '../fields/editors';
import { sectionHeader } from '../fields/section-header';
import { sectionSettings } from '../fields/section-settings';

/** Accordion plus FAQPage JSON-LD; the honest "what this is not" lives here. */
export const FaqBlock: Block = {
  slug: 'faq',
  interfaceName: 'FaqBlock',
  labels: { singular: 'FAQ', plural: 'FAQs' },
  fields: [
    sectionHeader(),
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 12,
      required: true,
      fields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'richText', editor: inlineListEditor, required: true },
      ],
    },
    sectionSettings(),
  ],
};
