import { CodeTabs } from '@repo/ui/marketing/code-tabs';
import { ThemedImage } from '@repo/ui/marketing/themed-image';
import { Steps } from '@repo/ui/marketing/steps';
import { RichText } from '@/components/rich-text';
import { highlight } from '@/lib/highlight';
import { resolveLink } from '@/lib/links';
import { resolveThemedMedia } from '@/lib/media';
import type { StepsBlock } from '@/payload-types';
import { toSectionHeader, toSettings } from './shared';

export async function StepsAdapter(block: StepsBlock) {
  const steps = await Promise.all(
    (block.steps ?? []).map(async (step) => {
      const media = resolveThemedMedia(step.media);
      const code = step.code?.code;
      return {
        title: step.title,
        description: step.description ? await RichText({ data: step.description }) : undefined,
        aside: code ? (
          <CodeTabs
            tabs={[
              {
                label: step.code?.language ?? 'ts',
                code,
                html: await highlight(code, step.code?.language),
              },
            ]}
          />
        ) : media ? (
          <ThemedImage sources={media} className="rounded-xl" />
        ) : undefined,
      };
    }),
  );

  return (
    <Steps
      header={await toSectionHeader(block.header)}
      settings={toSettings(block.settings)}
      link={resolveLink(block.link)}
      steps={steps}
    />
  );
}
