import { CodeTabs } from '@miguelfranken/ui/marketing/code-tabs';
import { Section } from '@miguelfranken/ui/marketing/section';
import { SectionHeader } from '@miguelfranken/ui/marketing/section-header';
import { highlight } from '@/lib/highlight';
import type { CodeBlockBlock } from '@/payload-types';
import { toSectionHeader, toSettings } from './shared';

export async function CodeBlockAdapter(block: CodeBlockBlock) {
  const tabs = await Promise.all(
    (block.tabs ?? []).map(async (tab) => ({
      label: tab.label,
      code: tab.code,
      html: await highlight(tab.code, tab.language),
    })),
  );

  const header = await toSectionHeader(block.header);

  return (
    <Section settings={toSettings(block.settings)}>
      <SectionHeader content={header} className="mb-8" />
      <CodeTabs tabs={tabs} caption={block.caption} />
    </Section>
  );
}
