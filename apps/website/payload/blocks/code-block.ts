import type { Block } from 'payload';
import { codeLanguages } from '../fields/code';
import { sectionHeader } from '../fields/section-header';
import { sectionSettings } from '../fields/section-settings';

/**
 * Tabbed source. The setup strip on the home page is one of these:
 * `playwright.config.ts`, `.env` and a GitHub Actions job, four lines each.
 *
 * Also embedded inside `prose` rich text, which is why this block imports no
 * rich-text editor of its own — that would close an import cycle.
 */
export const CodeBlock: Block = {
  slug: 'codeBlock',
  interfaceName: 'CodeBlockBlock',
  labels: { singular: 'Code', plural: 'Code' },
  fields: [
    sectionHeader(),
    {
      name: 'tabs',
      type: 'array',
      minRows: 1,
      maxRows: 4,
      required: true,
      admin: { initCollapsed: false },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', required: true, admin: { width: '60%' } },
            {
              name: 'language',
              type: 'select',
              defaultValue: 'ts',
              options: codeLanguages.map((value) => ({ label: value, value })),
              admin: { width: '40%' },
            },
          ],
        },
        { name: 'code', type: 'code', required: true },
      ],
    },
    { name: 'caption', type: 'text' },
    sectionSettings(),
  ],
};
