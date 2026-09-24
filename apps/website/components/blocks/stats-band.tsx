import { StatsBand } from '@repo/ui/marketing/stats-band';
import type { StatsBandBlock } from '@/payload-types';
import { toSectionHeader, toSettings } from './shared';

export async function StatsBandAdapter(block: StatsBandBlock) {
  return (
    <StatsBand
      header={await toSectionHeader(block.header)}
      settings={toSettings(block.settings)}
      items={(block.items ?? []).map((item) => ({
        value: item.value,
        label: item.label,
        hint: item.hint,
      }))}
    />
  );
}
