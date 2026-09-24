import type { ReactNode } from 'react';
import type { SectionHeaderContent, SectionSettings } from '@repo/ui/lib/marketing';
import { BrowserFrame } from '@repo/ui/marketing/browser-frame';
import { ThemedImage } from '@repo/ui/marketing/themed-image';
import { Demo } from '@/components/demos';
import { RichText } from '@/components/rich-text';
import { resolveThemedMedia, type CmsThemedMedia } from '@/lib/media';
import { DEMO_URLS, type DemoKey } from '@/payload/demos';

/**
 * The pieces every block adapter needs. Each one turns a generated Payload
 * shape into the plain props `@repo/ui/marketing` declares — this file and its
 * siblings are the only place the two ever meet.
 */

/** Payload emits every optional group field as `| null`; the UI wants `undefined`. */
export type CmsSectionHeader =
  | {
      eyebrow?: string | null;
      heading?: string | null;
      intro?: Parameters<typeof RichText>[0]['data'];
      align?: ('start' | 'center') | null;
    }
  | null
  | undefined;

export async function toSectionHeader(header: CmsSectionHeader): Promise<SectionHeaderContent | null> {
  if (!header) return null;
  return {
    eyebrow: header.eyebrow,
    heading: header.heading,
    intro: header.intro ? await RichText({ data: header.intro }) : undefined,
    align: header.align,
  };
}

export type CmsSectionSettings =
  | {
      background?: ('default' | 'sunken' | 'accent') | null;
      spacing?: ('normal' | 'compact') | null;
      anchor?: string | null;
    }
  | null
  | undefined;

export function toSettings(settings: CmsSectionSettings): SectionSettings | null {
  return settings ?? null;
}

/**
 * The visual half of a showcase or a media block: a screenshot pair or a live
 * demo, optionally inside a browser frame.
 */
export function Visual({
  kind,
  media,
  demo,
  frame = 'browser',
  caption,
  priority,
}: {
  kind?: ('media' | 'demo') | null;
  media?: CmsThemedMedia | null;
  demo?: string | null;
  frame?: ('browser' | 'plain' | 'none') | null;
  caption?: string | null;
  priority?: boolean;
}): ReactNode {
  if (kind === 'demo' && demo) {
    const key = demo as DemoKey;
    return (
      <BrowserFrame frame={frame ?? 'browser'} url={DEMO_URLS[key]} caption={caption}>
        <Demo demo={key} />
      </BrowserFrame>
    );
  }

  const sources = resolveThemedMedia(media);
  if (!sources) return null;

  return (
    <BrowserFrame frame={frame ?? 'browser'} caption={caption}>
      <ThemedImage sources={sources} priority={priority} sizes="(min-width: 1024px) 50vw, 100vw" />
    </BrowserFrame>
  );
}
