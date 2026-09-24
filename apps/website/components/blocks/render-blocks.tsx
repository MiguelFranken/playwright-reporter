import type { Page } from '@/payload-types';
import { CodeBlockAdapter } from './code-block';
import { ComparisonTableAdapter } from './comparison-table';
import { ContentAdapter } from './content';
import { CtaAdapter } from './cta';
import { FaqAdapter } from './faq';
import { FeatureGridAdapter } from './feature-grid';
import { FeatureShowcaseAdapter } from './feature-showcase';
import { MediaBlockAdapter } from './media-block';
import { ProductDemoAdapter } from './product-demo';
import { StatsBandAdapter } from './stats-band';
import { StepsAdapter } from './steps';

type LayoutBlock = Page['layout'][number];

/**
 * `blockType` → adapter.
 *
 * Every adapter is a server component that takes its generated Payload type
 * and returns a design-system component. A block type with no adapter renders
 * nothing and says so in development, rather than throwing on a page an editor
 * is in the middle of building.
 */
export async function RenderBlocks({ blocks }: { blocks?: LayoutBlock[] | null }) {
  if (!blocks?.length) return null;

  const rendered = await Promise.all(
    blocks.map(async (block, index) => {
      const key = `${block.blockType}-${block.id ?? index}`;
      const element = await renderBlock(block);
      return element ? <div key={key}>{element}</div> : null;
    }),
  );

  return <>{rendered}</>;
}

async function renderBlock(block: LayoutBlock) {
  switch (block.blockType) {
    case 'featureGrid':
      return FeatureGridAdapter(block);
    case 'featureShowcase':
      return FeatureShowcaseAdapter(block);
    case 'steps':
      return StepsAdapter(block);
    case 'codeBlock':
      return CodeBlockAdapter(block);
    case 'productDemo':
      return ProductDemoAdapter(block);
    case 'statsBand':
      return StatsBandAdapter(block);
    case 'comparisonTable':
      return ComparisonTableAdapter(block);
    case 'faq':
      return FaqAdapter(block);
    case 'cta':
      return CtaAdapter(block);
    case 'content':
      return ContentAdapter(block);
    case 'mediaBlock':
      return MediaBlockAdapter(block);
    default: {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`No renderer for block type "${(block as { blockType: string }).blockType}"`);
      }
      return null;
    }
  }
}
