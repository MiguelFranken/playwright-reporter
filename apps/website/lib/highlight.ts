import 'server-only';
import { createHighlighter, type Highlighter } from 'shiki';
import type { CodeLanguage } from '@/payload/fields/code';

/**
 * Syntax highlighting, on the server only.
 *
 * Both themes are rendered ahead of time and the `dark` class picks one at
 * paint, so no highlighter and no theme-switching JavaScript reach the
 * browser. Shiki emits `tabindex` and inline colours; the surrounding
 * `CodeTabs` styles the rest.
 */
const THEMES = { light: 'github-light', dark: 'github-dark-dimmed' } as const;

/** The CMS's language list, mapped onto Shiki's grammar names. */
const GRAMMAR: Record<CodeLanguage, string> = {
  ts: 'typescript',
  js: 'javascript',
  bash: 'bash',
  yaml: 'yaml',
  json: 'json',
  env: 'dotenv',
};

// One highlighter for the whole process: loading the grammars is the expensive
// part, and a static build highlights every snippet on the site in one pass.
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [THEMES.light, THEMES.dark],
    langs: Object.values(GRAMMAR),
  });
  return highlighterPromise;
}

export interface HighlightedCode {
  light: string;
  dark: string;
}

export async function highlight(
  code: string,
  language: CodeLanguage | null | undefined,
): Promise<HighlightedCode | null> {
  const lang = GRAMMAR[language ?? 'ts'] ?? 'typescript';
  try {
    const highlighter = await getHighlighter();
    return {
      light: highlighter.codeToHtml(code, { lang, theme: THEMES.light }),
      dark: highlighter.codeToHtml(code, { lang, theme: THEMES.dark }),
    };
  } catch {
    // A grammar that fails to load must not take the page down with it —
    // `CodeTabs` falls back to plain, unhighlighted source.
    return null;
  }
}
