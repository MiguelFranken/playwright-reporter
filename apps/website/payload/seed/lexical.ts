import type { Page } from '@/payload-types';

/**
 * The shape the generated page types expect for a rich-text field. Lexical's
 * own `SerializedEditorState` is structurally close but lacks the index
 * signature Payload's generator emits, so it does not assign.
 */
export type RichTextValue = NonNullable<NonNullable<Page['hero']>['lead']>;

/**
 * Minimal Lexical builders for the seed.
 *
 * Writing the serialized state by hand is unpleasant and easy to get subtly
 * wrong, so the seed's page data calls `paragraphs('…')` and these three
 * functions supply the boilerplate Lexical needs.
 */

type Node = Record<string, unknown>;

function text(value: string, format = 0): Node {
  return {
    type: 'text',
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text: value,
    version: 1,
  };
}

function paragraph(children: Node[]): Node {
  return {
    type: 'paragraph',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    version: 1,
  };
}

function heading(tag: 'h2' | 'h3' | 'h4', value: string): Node {
  return {
    type: 'heading',
    tag,
    children: [text(value)],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  };
}

function list(items: string[], ordered: boolean): Node {
  return {
    type: 'list',
    listType: ordered ? 'number' : 'bullet',
    tag: ordered ? 'ol' : 'ul',
    start: 1,
    children: items.map((item, index) => ({
      type: 'listitem',
      value: index + 1,
      children: [text(item)],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    })),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  };
}

function root(children: Node[]): RichTextValue {
  return {
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as RichTextValue;
}

/** One rich-text value, one paragraph per argument. */
export function paragraphs(...values: string[]): RichTextValue {
  return root(values.map((value) => paragraph([text(value)])));
}

/** A paragraph followed by a bulleted list. */
export function paragraphWithList(intro: string, items: string[]): RichTextValue {
  return root([paragraph([text(intro)]), list(items, false)]);
}

/** Long-form copy: an alternating sequence of headings, paragraphs and lists. */
export type ProseNode =
  | { h2: string }
  | { h3: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] };

export function prose(nodes: ProseNode[]): RichTextValue {
  return root(
    nodes.map((node) => {
      if ('h2' in node) return heading('h2', node.h2);
      if ('h3' in node) return heading('h3', node.h3);
      if ('ul' in node) return list(node.ul, false);
      if ('ol' in node) return list(node.ol, true);
      return paragraph([text(node.p)]);
    }),
  );
}
