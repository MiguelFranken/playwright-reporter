import { ComparisonTable } from '@repo/ui/marketing/comparison-table';
import { RichText } from '@/components/rich-text';
import type { ComparisonTableBlock } from '@/payload-types';
import { toSectionHeader, toSettings } from './shared';

export async function ComparisonTableAdapter(block: ComparisonTableBlock) {
  return (
    <ComparisonTable
      header={await toSectionHeader(block.header)}
      settings={toSettings(block.settings)}
      columns={(block.columns ?? []).map((column) => ({
        label: column.label,
        highlight: column.highlight ?? false,
      }))}
      rows={(block.rows ?? []).map((row) => ({
        capability: row.capability,
        cells: (row.cells ?? []).map((cell) => ({ state: cell.state, note: cell.note })),
      }))}
      footnote={block.footnote ? await RichText({ data: block.footnote }) : undefined}
    />
  );
}
