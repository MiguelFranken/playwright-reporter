import { FeatureGrid } from '@repo/ui/marketing/feature-grid';
import { featureIcons } from '@/components/icons';
import { resolveLink } from '@/lib/links';
import type { FeatureGridBlock } from '@/payload-types';
import { toSectionHeader, toSettings } from './shared';

export async function FeatureGridAdapter(block: FeatureGridBlock) {
  return (
    <FeatureGrid
      header={await toSectionHeader(block.header)}
      columns={(Number(block.columns ?? 3) as 2 | 3 | 4) ?? 3}
      settings={toSettings(block.settings)}
      items={(block.items ?? []).map((item) => ({
        icon: item.icon ? featureIcons[item.icon] : null,
        title: item.title,
        description: item.description,
        link: resolveLink(item.link),
      }))}
    />
  );
}
