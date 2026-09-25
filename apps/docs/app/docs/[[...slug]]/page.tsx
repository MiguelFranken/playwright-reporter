import { getBreadcrumbItems } from 'fumadocs-core/breadcrumb';
import { DocsBody, DocsPage, MarkdownCopyButton, ViewOptionsPopover } from 'fumadocs-ui/layouts/notebook/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OpenAPIPage } from '@/components/api-page';
import { HomeHero } from '@/components/home';
import { getMDXComponents } from '@/components/mdx';
import { PageHeader } from '@/components/page-header';
import { REPOSITORY } from '@/lib/layout.shared';
import { source, type DocsPage as Page } from '@/lib/source';

type Props = { params: Promise<{ slug?: string[] }> };

/** Every page is also served as Markdown (`next.config.mts`), for AI agents and "copy as Markdown". */
function markdownUrl(page: Page) {
  return `${page.url === '/docs' ? '/docs/index' : page.url}.md`;
}

/** The folder a page sits in, or its tab for a top-level page. */
function sectionOf(page: Page) {
  const items = getBreadcrumbItems(page.url, source.getPageTree(), { includeRoot: true });
  return items.at(-1)?.name;
}

function PageActions({ page }: { page: Page }) {
  const url = markdownUrl(page);
  return (
    <>
      <MarkdownCopyButton markdownUrl={url} />
      <ViewOptionsPopover
        markdownUrl={url}
        githubUrl={page.type === 'openapi' ? undefined : `${REPOSITORY}/blob/main/apps/docs/content/docs/${page.path}`}
      />
    </>
  );
}

export default async function Page(props: Props) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const header = (
    <PageHeader
      section={sectionOf(page)}
      title={page.data.title}
      // An endpoint's reference repeats its description right below.
      description={page.type === 'openapi' ? undefined : page.data.description}
      actions={<PageActions page={page} />}
    />
  );

  if (page.type === 'openapi') {
    return (
      <DocsPage toc={page.data.toc} full breadcrumb={{ enabled: false }}>
        {header}
        <DocsBody>
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }

  const MDX = page.data.body;
  const home = page.url === '/docs';
  return (
    <DocsPage toc={page.data.toc} full={page.data.full} breadcrumb={{ enabled: false }} tableOfContent={{ enabled: !home }} tableOfContentPopover={{ enabled: !home }}>
      {home ? <HomeHero /> : header}
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
