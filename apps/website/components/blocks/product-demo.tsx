import { Section } from '@miguelfranken/ui/marketing/section';
import { SectionHeader } from '@miguelfranken/ui/marketing/section-header';
import type { ProductDemoBlock } from '@/payload-types';
import { toSectionHeader, toSettings, Visual } from './shared';

export async function ProductDemoAdapter(block: ProductDemoBlock) {
  return (
    <Section settings={toSettings(block.settings)}>
      <SectionHeader content={await toSectionHeader(block.header)} className="mb-8" />
      <Visual kind="demo" demo={block.demo} frame={block.frame} caption={block.caption} />
    </Section>
  );
}
