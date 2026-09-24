import type { Field, RowField, TextField } from 'payload';
import { slugField } from 'payload';

/**
 * Paths the app owns. A page claiming one of them would be unreachable at
 * best and would shadow the admin panel at worst.
 */
export const reservedSlugs = ['admin', 'api', 'next', '_next', 'sitemap.xml', 'robots.txt'];

function isTextField(field: Field): field is TextField {
  return field.type === 'text';
}

/**
 * Payload's own `slugField()` (auto-generate from the title, with a lock),
 * plus the reserved-path check. `home` is legal and means `/`.
 */
export function pageSlugField(): RowField {
  return slugField({
    overrides: (row) => {
      const text = row.fields.find(isTextField);
      if (text) {
        text.validate = (value: string | null | undefined) => {
          if (!value) return 'A slug is required.';
          if (reservedSlugs.includes(value)) return `"${value}" is reserved by the application.`;
          if (!/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(value)) {
            return 'Use lowercase letters, numbers, hyphens and / only.';
          }
          return true;
        };
        text.admin = {
          ...text.admin,
          description: 'The path this page lives at. "home" is the site root.',
        };
      }
      return row;
    },
  });
}
