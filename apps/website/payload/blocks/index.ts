import type { Block, BlockSlug } from 'payload';
import { CodeBlock } from './code-block';
import { ComparisonTableBlock } from './comparison-table';
import { ContentBlock } from './content';
import { CtaBlock } from './cta';
import { FaqBlock } from './faq';
import { FeatureGridBlock } from './feature-grid';
import { FeatureShowcaseBlock } from './feature-showcase';
import { MediaBlock } from './media-block';
import { ProductDemoBlock } from './product-demo';
import { StatsBandBlock } from './stats-band';
import { StepsBlock } from './steps';

/**
 * Registered once on the config and referenced by slug from the `layout`
 * field (`blockReferences`), which is what lets `codeBlock` be both a layout
 * block and an inline block inside prose without being defined twice.
 */
export const blocks: Block[] = [
  FeatureGridBlock,
  FeatureShowcaseBlock,
  StepsBlock,
  CodeBlock,
  ProductDemoBlock,
  StatsBandBlock,
  ComparisonTableBlock,
  FaqBlock,
  CtaBlock,
  ContentBlock,
  MediaBlock,
];

/**
 * `blockReferences` on the `layout` field takes slugs, and it wants them typed
 * as the literal union rather than `string[]`.
 */
export const blockSlugs = blocks.map((block) => block.slug) as BlockSlug[];
