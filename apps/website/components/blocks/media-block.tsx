import { Section } from '@repo/ui/marketing/section';
import type { MediaBlock } from '@/payload-types';
import { toSettings, Visual } from './shared';

const SIZE = {
  content: 'mx-auto max-w-3xl',
  wide: '',
  full: '',
} as const;

export function MediaBlockAdapter(block: MediaBlock) {
  return (
    <Section
      settings={toSettings(block.settings)}
      innerClassName={block.size === 'full' ? 'max-w-none px-0' : undefined}
    >
      <div className={SIZE[block.size ?? 'content']}>
        <Visual
          kind="media"
          media={block.media}
          frame={block.frame}
          caption={block.caption}
        />
      </div>
    </Section>
  );
}
