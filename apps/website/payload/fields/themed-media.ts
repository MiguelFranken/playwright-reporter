import type { Condition, Field } from 'payload';

/**
 * A light/dark screenshot pair. Product screenshots carry app chrome, so a
 * single image is wrong in one of the two themes — the renderer shows `light`
 * and swaps to `dark` under the `dark` class, falling back to `light` when the
 * editor only uploaded one.
 *
 * Alt text lives on the media document, not here, so it stays with the file.
 */
export function themedMedia({
  name = 'media',
  required = false,
  condition,
}: { name?: string; required?: boolean; condition?: Condition } = {}): Field {
  return {
    name,
    type: 'group',
    admin: { hideGutter: true, condition },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'light',
            type: 'upload',
            relationTo: 'media',
            required,
            admin: { width: '50%' },
          },
          {
            name: 'dark',
            type: 'upload',
            relationTo: 'media',
            admin: { width: '50%', description: 'Optional. Falls back to the light image.' },
          },
        ],
      },
    ],
  };
}
