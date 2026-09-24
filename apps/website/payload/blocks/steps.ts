import type { Block } from 'payload';
import { codeSnippet } from '../fields/code';
import { inlineEditor } from '../fields/editors';
import { link } from '../fields/link';
import { sectionHeader } from '../fields/section-header';
import { sectionSettings } from '../fields/section-settings';
import { themedMedia } from '../fields/themed-media';

/** Numbered sequence: "how it works" on the home page, "get started" on its own page. */
export const StepsBlock: Block = {
  slug: 'steps',
  interfaceName: 'StepsBlock',
  labels: { singular: 'Steps', plural: 'Steps' },
  fields: [
    sectionHeader(),
    {
      name: 'steps',
      type: 'array',
      minRows: 2,
      maxRows: 6,
      required: true,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'richText', editor: inlineEditor },
        codeSnippet(),
        themedMedia(),
      ],
    },
    link({ required: false }),
    sectionSettings(),
  ],
};
