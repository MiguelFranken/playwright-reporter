import { BrowserFrame } from '@repo/ui/marketing/browser-frame';
import { CodeTabs } from '@repo/ui/marketing/code-tabs';
import { Hero } from '@repo/ui/marketing/hero';
import { ThemedImage } from '@repo/ui/marketing/themed-image';
import { Demo } from '@/components/demos';
import { RichText } from '@/components/rich-text';
import { highlight } from '@/lib/highlight';
import { resolveLinks } from '@/lib/links';
import { resolveThemedMedia } from '@/lib/media';
import { DEMO_URLS, type DemoKey } from '@/payload/demos';
import type { Page } from '@/payload-types';

/**
 * The page's hero group. Not a layout block: a page has at most one and it is
 * always first, so making it orderable would only give editors a way to get it
 * wrong.
 */
export async function RenderHero({ hero }: { hero?: Page['hero'] }) {
  if (!hero || hero.variant === 'none' || !hero.heading) return null;

  const media = resolveThemedMedia(hero.media);
  const demo = hero.demo as DemoKey | null | undefined;

  // A demo wins over a screenshot: it is the stronger proof and it cannot go
  // stale. The screenshot is the fallback for screens a demo cannot show.
  const visual = demo ? (
    <BrowserFrame url={DEMO_URLS[demo]}>
      <Demo demo={demo} />
    </BrowserFrame>
  ) : media ? (
    <BrowserFrame>
      <ThemedImage sources={media} priority sizes="(min-width: 1024px) 55vw, 100vw" />
    </BrowserFrame>
  ) : undefined;

  const code = hero.snippet?.code;

  return (
    <Hero
      variant={hero.variant === 'split' ? 'split' : 'centered'}
      eyebrow={hero.eyebrow}
      heading={hero.heading}
      lead={hero.lead ? await RichText({ data: hero.lead }) : undefined}
      links={resolveLinks(hero.links)}
      visual={visual}
      snippet={
        code ? (
          <CodeTabs
            tabs={[
              {
                label: hero.snippet?.language ?? 'ts',
                code,
                html: await highlight(code, hero.snippet?.language),
              },
            ]}
          />
        ) : undefined
      }
    />
  );
}
