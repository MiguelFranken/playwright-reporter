import type { Field } from 'payload';

export const codeLanguages = ['ts', 'js', 'bash', 'yaml', 'json', 'env'] as const;
export type CodeLanguage = (typeof codeLanguages)[number];

/** A language + source pair, highlighted on the server at render time. */
export function codeSnippet({
  name = 'code',
  required = false,
}: { name?: string; required?: boolean } = {}): Field {
  return {
    name,
    type: 'group',
    admin: { hideGutter: true },
    fields: [
      {
        name: 'language',
        type: 'select',
        defaultValue: 'ts',
        options: codeLanguages.map((value) => ({ label: value, value })),
      },
      { name: 'code', type: 'code', required, admin: { language: 'typescript' } },
    ],
  };
}
