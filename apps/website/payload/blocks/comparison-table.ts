import type { Block } from 'payload';
import { inlineEditor } from '../fields/editors';
import { sectionHeader } from '../fields/section-header';
import { sectionSettings } from '../fields/section-settings';

export const comparisonStates = ['yes', 'partial', 'no', 'planned'] as const;
export type ComparisonState = (typeof comparisonStates)[number];

/**
 * Us against the alternatives, as facts. Each cell carries a state and an
 * optional note, so "partial" can say what the partial part is instead of
 * leaving the reader to guess.
 */
export const ComparisonTableBlock: Block = {
  slug: 'comparisonTable',
  interfaceName: 'ComparisonTableBlock',
  labels: { singular: 'Comparison table', plural: 'Comparison tables' },
  fields: [
    sectionHeader(),
    {
      name: 'columns',
      type: 'array',
      minRows: 2,
      maxRows: 3,
      required: true,
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', required: true, admin: { width: '70%' } },
            {
              name: 'highlight',
              type: 'checkbox',
              label: 'This is us',
              admin: { width: '30%' },
            },
          ],
        },
      ],
    },
    {
      name: 'rows',
      type: 'array',
      required: true,
      fields: [
        { name: 'capability', type: 'text', required: true },
        {
          name: 'cells',
          type: 'array',
          required: true,
          admin: { description: 'One cell per column, in the same order.' },
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'state',
                  type: 'select',
                  required: true,
                  defaultValue: 'yes',
                  options: comparisonStates.map((value) => ({ label: value, value })),
                  admin: { width: '30%' },
                },
                { name: 'note', type: 'text', admin: { width: '70%' } },
              ],
            },
          ],
        },
      ],
    },
    { name: 'footnote', type: 'richText', editor: inlineEditor },
    sectionSettings(),
  ],
};
