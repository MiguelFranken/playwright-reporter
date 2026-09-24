import type { Field } from 'payload';

export const sectionBackgrounds = ['default', 'sunken', 'accent'] as const;
export const sectionSpacings = ['normal', 'compact'] as const;

/**
 * Per-section presentation, in the sidebar because it is chrome rather than
 * content: the band's background, its vertical rhythm, and the `#anchor` that
 * lets a nav item or an in-page link point at it.
 */
export function sectionSettings(): Field {
  return {
    name: 'settings',
    type: 'group',
    admin: { hideGutter: true },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'background',
            type: 'select',
            defaultValue: 'default',
            options: sectionBackgrounds.map((value) => ({ label: value, value })),
            admin: { width: '33%' },
          },
          {
            name: 'spacing',
            type: 'select',
            defaultValue: 'normal',
            options: sectionSpacings.map((value) => ({ label: value, value })),
            admin: { width: '33%' },
          },
          {
            name: 'anchor',
            type: 'text',
            admin: { width: '34%', description: 'Optional #id for in-page links.' },
          },
        ],
      },
    ],
  };
}
