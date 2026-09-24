import { Faq } from '@repo/ui/marketing/faq';
import { RichText } from '@/components/rich-text';
import type { FaqBlock } from '@/payload-types';
import { toSectionHeader, toSettings } from './shared';

export async function FaqAdapter(block: FaqBlock) {
  const items = await Promise.all(
    (block.items ?? []).map(async (item) => ({
      question: item.question,
      answer: await RichText({ data: item.answer }),
    })),
  );

  return (
    <Faq
      header={await toSectionHeader(block.header)}
      settings={toSettings(block.settings)}
      items={items}
    />
  );
}
