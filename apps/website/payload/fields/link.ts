import type { Condition, Field } from 'payload';

export const linkAppearances = ['primary', 'secondary', 'ghost', 'link'] as const;

export type LinkFieldArgs = {
  /** Adds the `appearance` select — CTAs want it, navigation items do not. */
  appearances?: boolean;
  /** Field name; `link` unless the caller needs several on one row. */
  name?: string;
  /** Hides the whole group behind a sibling's value. */
  condition?: Condition;
  /**
   * Whether the label is required. True inside an array, where adding a row is
   * already the editor saying they want a link; false for the standalone
   * optional link on a section, which is usually left empty.
   */
  required?: boolean;
};

/**
 * One link. `internal` points at a page and survives a slug change because the
 * href is resolved at render time (`lib/links.ts`); `custom` is for GitHub, the
 * docs subdomain and `mailto:`.
 */
export function link({
  appearances = false,
  name = 'link',
  condition,
  required = true,
}: LinkFieldArgs = {}): Field {
  return {
    name,
    type: 'group',
    admin: { hideGutter: true, condition },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'type',
            type: 'radio',
            defaultValue: 'internal',
            options: [
              { label: 'Internal page', value: 'internal' },
              { label: 'Custom URL', value: 'custom' },
            ],
            admin: { layout: 'horizontal', width: '50%' },
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: 'Open in a new tab',
            admin: { width: '50%', style: { alignSelf: 'flex-end' } },
          },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            name: 'reference',
            type: 'relationship',
            relationTo: 'pages',
            label: 'Page',
            admin: {
              width: '50%',
              condition: (_data, siblingData) => siblingData?.type === 'internal',
            },
          },
          {
            name: 'url',
            type: 'text',
            label: 'URL',
            admin: {
              width: '50%',
              condition: (_data, siblingData) => siblingData?.type === 'custom',
              description: 'An absolute URL, a mailto: address or a path such as /features.',
            },
          },
          {
            name: 'label',
            type: 'text',
            required,
            admin: { width: '50%' },
          },
        ],
      },
      ...(appearances
        ? ([
            {
              name: 'appearance',
              type: 'select',
              defaultValue: 'primary',
              options: linkAppearances.map((value) => ({ label: value, value })),
            },
          ] satisfies Field[])
        : []),
    ],
  };
}

/** An array of links; CTA pairs cap at two so a section never grows a button bar. */
export function linkGroup({
  max = 2,
  name = 'links',
  appearances = true,
}: { max?: number; name?: string; appearances?: boolean } = {}): Field {
  return {
    name,
    type: 'array',
    maxRows: max,
    admin: { initCollapsed: false },
    fields: [link({ appearances })],
  };
}
