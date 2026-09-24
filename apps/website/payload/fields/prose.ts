import {
  BlockquoteFeature,
  BlocksFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnderlineFeature,
  UnorderedListFeature,
  UploadFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical';
import { CodeBlock } from '../blocks/code-block';

/**
 * Long-form copy: the `content` block and the legal pages, where the editor
 * genuinely owns the document structure. Embeds `codeBlock` so a get-started
 * paragraph can be followed by the command it is describing.
 */
export const proseEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    InlineCodeFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    LinkFeature({ enabledCollections: ['pages'] }),
    UploadFeature(),
    BlocksFeature({ blocks: [CodeBlock] }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
});
