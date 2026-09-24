import type { Field } from 'payload';
import { inlineEditor } from './editors';

/**
 * Eyebrow, heading and intro — the three lines above every section. Optional
 * as a whole: a section whose heading is empty renders without a header, which
 * is how the abridged comparison table sits directly under the one above it.
 */
export function sectionHeader({ name = 'header' }: { name?: string } = {}): Field {
  return {
    name,
    type: 'group',
    admin: { hideGutter: true },
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'eyebrow', type: 'text', admin: { width: '40%' } },
          { name: 'heading', type: 'text', admin: { width: '60%' } },
        ],
      },
      { name: 'intro', type: 'richText', editor: inlineEditor },
      {
        name: 'align',
        type: 'select',
        defaultValue: 'start',
        options: [
          { label: 'Left', value: 'start' },
          { label: 'Centered', value: 'center' },
        ],
      },
    ],
  };
}
