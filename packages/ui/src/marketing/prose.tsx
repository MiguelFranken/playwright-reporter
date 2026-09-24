import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Typography for editor-authored rich text.
 *
 * Deliberately a handful of descendant selectors rather than a plugin: the
 * roles already exist, and the point is that a CMS heading is the *same*
 * `display-m` the hand-built sections use.
 */
export function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'max-w-prose text-body-m text-foreground',
        '[&_p]:my-4 [&_p]:text-body-m [&_p]:leading-7',
        '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-display-m',
        '[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-title-m',
        '[&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:text-headline-m',
        '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1.5',
        '[&_a]:text-accent-text [&_a]:underline [&_a]:underline-offset-4',
        '[&_code]:rounded [&_code]:bg-surface-sunken [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-code-s',
        '[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-accent-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
        '[&_hr]:my-10 [&_hr]:border-separator',
        '[&_:first-child]:mt-0 [&_:last-child]:mb-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
