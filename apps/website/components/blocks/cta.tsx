import { CtaBand } from '@repo/ui/marketing/cta-band';
import { RichText } from '@/components/rich-text';
import { resolveLinks } from '@/lib/links';
import type { CtaBlock } from '@/payload-types';
import { toSettings } from './shared';

export async function CtaAdapter(block: CtaBlock) {
  return (
    <CtaBand
      heading={block.heading}
      text={block.text ? await RichText({ data: block.text }) : undefined}
      links={resolveLinks(block.links)}
      tone={block.tone ?? 'default'}
      settings={toSettings(block.settings)}
    />
  );
}
