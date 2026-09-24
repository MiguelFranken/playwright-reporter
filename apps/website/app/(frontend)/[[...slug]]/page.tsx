import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';
import { RenderBlocks } from '@/components/blocks/render-blocks';
import { RenderHero } from '@/components/blocks/hero';
import { resolveMedia } from '@/lib/media';
import { queryPageBySlug, queryPublishedPages, querySiteSettings } from '@/lib/queries';
import type { Page as PageDoc } from '@/payload-types';

const serverURL = process.env.BASE_URL ?? 'http://localhost:3001';

type Params = { slug?: string[] };

/**
 * Every page is static and stays static until an editor publishes: the
 * collection's `afterChange` hook calls `revalidatePath`, so a publish is
 * visible in seconds without a deploy. Draft mode opts an individual request
 * out of the static render, which is how live preview shows unpublished work.
 */
export const dynamic = 'force-static';
export const revalidate = false;

export async function generateStaticParams(): Promise<Params[]> {
  const pages = await queryPublishedPages();
  return pages.map((page) => (page.slug === 'home' ? { slug: [] } : { slug: page.slug.split('/') }));
}

export default async function Page({ params }: { params: Promise<Params> }) {
  // `params` is a Promise in Next 16.
  const { slug } = await params;
  const page = await queryPageBySlug(slug?.join('/') || 'home');
  if (!page) notFound();

  return (
    <>
      <RenderHero hero={page.hero} />
      <RenderBlocks blocks={page.layout} />
      <FaqJsonLd page={page} />
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const path = slug?.join('/') || 'home';
  const [page, settings] = await Promise.all([queryPageBySlug(path), querySiteSettings()]);
  if (!page) return {};

  const image = resolveMedia(page.meta?.image) ?? resolveMedia(settings.defaultOgImage);
  const url = `${serverURL}${path === 'home' ? '' : `/${path}`}`;
  const description = page.meta?.description ?? settings.description ?? undefined;

  return {
    title: page.meta?.title ?? page.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: page.meta?.title ?? page.title,
      description,
      url,
      images: image ? [{ url: image.src, width: image.width, height: image.height, alt: image.alt }] : undefined,
    },
    // A draft rendered through the preview route must never be indexed.
    robots: (await draftMode()).isEnabled ? { index: false, follow: false } : undefined,
  };
}

/**
 * FAQ blocks get `FAQPage` structured data. Emitted from the page rather than
 * from the block because only the page knows it is the document's FAQ.
 */
function FaqJsonLd({ page }: { page: PageDoc }) {
  const faq = page.layout?.find((block) => block.blockType === 'faq');
  if (!faq || faq.blockType !== 'faq' || !faq.items?.length) return null;

  const json = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: plainText(item.answer) },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, '\\u003c') }}
    />
  );
}

/** Lexical state → the text of it, which is all schema.org wants. */
function plainText(data: unknown): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const record = node as { text?: unknown; children?: unknown; root?: unknown };
    if (typeof record.text === 'string') out.push(record.text);
    if (record.root) walk(record.root);
    if (Array.isArray(record.children)) record.children.forEach(walk);
  };
  walk(data);
  return out.join(' ').trim();
}
