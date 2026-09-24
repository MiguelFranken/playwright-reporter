import { Prose } from '@repo/ui/marketing/prose';
import { Section } from '@repo/ui/marketing/section';
import { RichText } from '@/components/rich-text';
import type { ContentBlock } from '@/payload-types';
import { toSettings } from './shared';

const WIDTH = {
  full: 'md:col-span-6',
  half: 'md:col-span-3',
  third: 'md:col-span-2',
} as const;

export async function ContentAdapter(block: ContentBlock) {
  const columns = await Promise.all(
    (block.columns ?? []).map(async (column, index) => ({
      key: column.id ?? String(index),
      width: WIDTH[column.width ?? 'full'],
      body: column.richText ? await RichText({ data: column.richText }) : null,
    })),
  );

  return (
    <Section settings={toSettings(block.settings)}>
      <div className="grid gap-8 md:grid-cols-6">
        {columns.map((column) => (
          <div key={column.key} className={column.width}>
            <Prose>{column.body}</Prose>
          </div>
        ))}
      </div>
    </Section>
  );
}
