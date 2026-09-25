import { notFound } from 'next/navigation';
import { docsLlms, source } from '@/lib/source';

export const revalidate = false;

/** One page as Markdown; `/docs/<page>.md` is rewritten here (`next.config.mts`). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  // The rewrite appends a fixed `content.md` segment.
  const slugs = slug?.slice(0, -1) ?? [];
  if (slugs.at(-1) === 'index') slugs.pop();
  const page = source.getPage(slugs);
  if (!page) notFound();
  return new Response(await docsLlms.page(page), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
}

export function generateStaticParams() {
  return source.generateParams().map(({ slug }) => ({ slug: [...(slug.length ? slug : ['index']), 'content.md'] }));
}
