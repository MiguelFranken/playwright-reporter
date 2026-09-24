import { FeatureShowcase } from '@miguelfranken/ui/marketing/feature-showcase';
import { resolveLink } from '@/lib/links';
import type { FeatureShowcaseBlock } from '@/payload-types';
import { toSectionHeader, toSettings, Visual } from './shared';

export async function FeatureShowcaseAdapter(block: FeatureShowcaseBlock) {
  return (
    <FeatureShowcase
      header={await toSectionHeader(block.header)}
      settings={toSettings(block.settings)}
      bullets={(block.bullets ?? []).map((bullet) => bullet.text)}
      mediaSide={block.mediaSide ?? 'right'}
      link={resolveLink(block.link)}
      visual={
        <Visual
          kind={block.visual?.kind}
          media={block.visual?.media}
          demo={block.visual?.demo}
          frame={block.visual?.frame}
          caption={block.visual?.caption}
        />
      }
    />
  );
}
