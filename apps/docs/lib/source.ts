import { loader } from 'fumadocs-core/source';
import { llms } from 'fumadocs-core/source/llms';
import { lucideIconsPlugin } from 'fumadocs-core/source/plugins/lucide-icons';
import { defineDocs } from 'fumadocs-mdx/macro';
import { openapi } from './openapi';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    // Keeps each page's Markdown, for llms.txt, the .md routes and the MCP server.
    postprocess: { includeProcessedMarkdown: true },
  },
});

/**
 * The hand-written pages (content/docs) and one page per REST endpoint,
 * generated from the OpenAPI document under /docs/api/reference.
 */
export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    openapi: await openapi.staticSource({ baseDir: 'api/reference', groupBy: 'tag', meta: true }),
  },
  {
    baseUrl: '/docs',
    plugins: [lucideIconsPlugin(), openapi.loaderPlugin()],
  },
);

export type DocsPage = NonNullable<ReturnType<typeof source.getPage>>;

/** Markdown of any page: the processed MDX, or a summary of an API operation. */
async function pageText(page: DocsPage): Promise<string> {
  const header = `# ${page.data.title}\n\nURL: ${page.url}\n${page.data.description ? `\n${page.data.description}\n` : ''}`;
  if (page.type === 'openapi') {
    const { bundled } = page.data.getSchema();
    const operations = page.data.getOpenAPIPageProps().operations ?? [];
    const lines = operations.map(({ path, method }) => {
      const op = (bundled.paths?.[path] as Record<string, { summary?: string; description?: string }> | undefined)?.[method];
      return `## ${method.toUpperCase()} ${path}\n\n${op?.description ?? op?.summary ?? ''}`;
    });
    return `${header}\n${lines.join('\n\n')}\n\nThe full schema is in the OpenAPI document: /api/v1/openapi.json on any instance.`;
  }
  return `${header}\n${await page.data.getText('processed')}`;
}

export const docsLlms = llms(source, { renderPage: pageText });
