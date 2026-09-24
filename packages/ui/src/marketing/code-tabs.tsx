'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/tabs';
import { CopyButton } from '../patterns/copy-button';
import { cn } from '../lib/cn';

export interface CodeTab {
  label: string;
  /** Pre-highlighted markup, one per theme. The host highlights on the server. */
  html?: { light: string; dark: string } | null;
  /** The raw source. What the copy button puts on the clipboard. */
  code: string;
}

/**
 * Tabbed source with a copy button.
 *
 * Highlighting happens on the server and arrives as HTML, so no highlighter
 * ships to the browser; only the tab switching is client-side. Both themes'
 * markup is in the document and the `dark` class picks one, which is the same
 * trick `ThemedImage` uses and for the same reason.
 */
export function CodeTabs({
  tabs,
  caption,
  className,
}: {
  tabs: CodeTab[];
  caption?: string | null;
  className?: string;
}) {
  const first = tabs[0];
  if (!first) return null;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Tabs defaultValue={first.label} className="panel gap-0 bg-surface-sunken">
        <div className="flex items-center justify-between gap-2 border-b border-separator px-2">
          <TabsList variant="line" className="border-0 pb-0">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.label} value={tab.label} className="text-code-s">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((tab) => (
          <TabsContent key={tab.label} value={tab.label} className="relative">
            <CopyButton
              value={tab.code}
              label={`Copy ${tab.label}`}
              variant="ghost"
              className="absolute top-2 right-2 z-10"
            />
            <CodeBody tab={tab} />
          </TabsContent>
        ))}
      </Tabs>
      {caption ? <p className="text-body-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

function CodeBody({ tab }: { tab: CodeTab }) {
  const shell =
    'overflow-x-auto scrollbar-slim p-4 text-code-s [&_pre]:!bg-transparent [&_pre]:min-w-fit';

  // A region that scrolls must be reachable by keyboard, and it needs a name
  // once it is focusable.
  const scrollable = { tabIndex: 0, role: 'region', 'aria-label': `${tab.label} source` };

  if (!tab.html) {
    return (
      <pre {...scrollable} className={cn(shell, 'whitespace-pre')}>
        <code>{tab.code}</code>
      </pre>
    );
  }

  return (
    <>
      <div
        {...scrollable}
        className={cn(shell, 'dark:hidden')}
        // Shiki output, generated on the server from editor-supplied source.
        dangerouslySetInnerHTML={{ __html: tab.html.light }}
      />
      <div
        {...scrollable}
        className={cn(shell, 'hidden dark:block')}
        dangerouslySetInnerHTML={{ __html: tab.html.dark }}
      />
    </>
  );
}
