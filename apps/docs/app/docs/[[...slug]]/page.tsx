import { DocsBody, DocsDescription, DocsPage, DocsTitle, MarkdownCopyButton, ViewOptionsPopover } from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OpenAPIPage } from '@/components/api-page';
import { getMDXComponents } from '@/components/mdx';
import { REPOSITORY } from '@/lib/layout.shared';
import { source, type DocsPage as Page } from '@/lib/source';

type Props = { params: Promise<{ slug?: string[] }> };

/** Every page is also served as Markdown (`next.config.mts`), for AI agents and "copy as Markdown". */
function markdownUrl(page: Page) {
  return `${page.url === '/docs' ? '/docs/index' : page.url}.md`;
}

function PageActions({ page }: { page: Page }) {
  const url = markdownUrl(page);
  return (
    <div className="flex flex-row items-center gap-2 border-b pb-6">
      <MarkdownCopyButton markdownUrl={url} />
      <ViewOptionsPopover
        markdownUrl={url}
        githubUrl={page.type === 'openapi' ? undefined : `${REPOSITORY}/blob/main/apps/docs/content/docs/${page.path}`}
      />
    </div>
  );
}

export default async function Page(props: Props) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  if (page.type === 'openapi') {
    return (
      <DocsPage toc={page.data.toc} full>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <PageActions page={page} />
        <DocsBody>
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }

  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <PageActions page={page} />
      <DocsBody>
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
