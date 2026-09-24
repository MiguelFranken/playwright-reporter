import {
  RichText as LexicalRichText,
  type JSXConvertersFunction,
} from '@payloadcms/richtext-lexical/react';
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical';
import { ThemedImage } from '@miguelfranken/ui/marketing/themed-image';
import { CodeTabs } from '@miguelfranken/ui/marketing/code-tabs';
import { highlight } from '@/lib/highlight';
import { pathForSlug } from '@/lib/links';
import type { CodeBlockBlock, Media } from '@/payload-types';

/**
 * Lexical → JSX, with the three node types that need our own components:
 *
 * - internal links resolve through the page's slug, the same way `lib/links`
 *   does, so a renamed page does not leave a dead link in a paragraph;
 * - an `upload` node renders as an image with its alt text from the media doc;
 * - an embedded `codeBlock` renders as the real `CodeTabs`, highlighted.
 *
 * Highlighting is async, so the code block's HTML is prepared before this
 * component renders (`prepareCodeHtml`) and handed in as a lookup.
 */
export type CodeHtmlMap = Record<string, { light: string; dark: string } | null>;

function converters(codeHtml: CodeHtmlMap): JSXConvertersFunction {
  return ({ defaultConverters }) => ({
    ...defaultConverters,
    link: ({ node, nodesToJSX }) => {
      const fields = node.fields;
      const children = nodesToJSX({ nodes: node.children });
      const href =
        fields?.linkType === 'internal' && typeof fields.doc?.value === 'object'
          ? pathForSlug((fields.doc.value as { slug?: string }).slug)
          : (fields?.url ?? '#');
      return (
        <a
          href={href}
          target={fields?.newTab ? '_blank' : undefined}
          rel={fields?.newTab ? 'noreferrer noopener' : undefined}
        >
          {children}
        </a>
      );
    },
    upload: ({ node }) => {
      const media = node.value as Media | number | null;
      if (!media || typeof media === 'number' || !media.url) return null;
      return (
        <ThemedImage
          sources={{
            light: { src: media.url, width: media.width ?? undefined, height: media.height ?? undefined },
            alt: media.alt ?? '',
          }}
          className="my-6 rounded-xl"
        />
      );
    },
    blocks: {
      codeBlock: ({ node }: { node: { fields: CodeBlockBlock } }) => {
        const block = node.fields as CodeBlockBlock;
        return (
          <CodeTabs
            className="my-6"
            caption={block.caption}
            tabs={(block.tabs ?? []).map((tab) => ({
              label: tab.label,
              code: tab.code,
              html: codeHtml[codeKey(block.id ?? '', tab.label)] ?? null,
            }))}
          />
        );
      },
    },
  });
}

function codeKey(blockId: string, label: string): string {
  return `${blockId}::${label}`;
}

type EditorState = SerializedEditorState | null | undefined;

/**
 * Walks the tree for `codeBlock` nodes and highlights them, because the
 * converters themselves have to be synchronous.
 */
export async function prepareCodeHtml(data: EditorState): Promise<CodeHtmlMap> {
  const map: CodeHtmlMap = {};
  if (!data?.root) return map;

  const queue: { type?: string; [k: string]: unknown }[] = [data.root as never];
  while (queue.length > 0) {
    const node = queue.shift()!;
    const children = node.children as typeof queue | undefined;
    if (Array.isArray(children)) queue.push(...children);

    if (node.type !== 'block') continue;
    const fields = node.fields as CodeBlockBlock | undefined;
    if (fields?.blockType !== 'codeBlock') continue;

    for (const tab of fields.tabs ?? []) {
      map[codeKey(fields.id ?? '', tab.label)] = await highlight(tab.code, tab.language);
    }
  }
  return map;
}

/**
 * Renders editor content. Async so it can prepare its own highlighting; call
 * sites `await` it like any other server component.
 */
export async function RichText({
  data,
  className,
}: {
  data: EditorState;
  className?: string;
}) {
  if (!data) return null;
  const codeHtml = await prepareCodeHtml(data);
  return <LexicalRichText className={className} converters={converters(codeHtml)} data={data} />;
}
