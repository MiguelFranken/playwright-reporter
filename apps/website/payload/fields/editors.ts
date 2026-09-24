import {
  BoldFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnderlineFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical';

/**
 * The short feature set, for the one-or-two-sentence fields that sit inside a
 * section (leads, intros, captions, footnotes): no headings, no blocks,
 * nothing that can break a section's layout.
 *
 * The long-form set lives in `prose.ts`, which pulls in blocks and therefore
 * must not be imported from a block definition.
 */
export const inlineEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    InlineCodeFeature(),
    LinkFeature({ enabledCollections: ['pages'] }),
    InlineToolbarFeature(),
  ],
});

/** `inline`, plus lists — enough for an FAQ answer. */
export const inlineListEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    InlineCodeFeature(),
    LinkFeature({ enabledCollections: ['pages'] }),
    UnorderedListFeature(),
    OrderedListFeature(),
    InlineToolbarFeature(),
  ],
});
