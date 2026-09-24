import { cn } from '../lib/cn';
import type { SectionHeaderContent } from '../lib/marketing';

/**
 * Eyebrow, heading, intro. Renders nothing at all when the editor left the
 * heading empty, so a block can sit directly under the one above it without a
 * gap where a header would have been.
 */
export function SectionHeader({
  content,
  className,
}: {
  content?: SectionHeaderContent | null;
  className?: string;
}) {
  if (!content?.heading && !content?.eyebrow && !content?.intro) return null;
  const centered = content.align === 'center';
  return (
    <header
      className={cn(
        'flex flex-col gap-3',
        centered ? 'mx-auto max-w-2xl items-center text-center' : 'max-w-2xl',
        className,
      )}
    >
      {content.eyebrow ? <p className="text-eyebrow text-accent-text">{content.eyebrow}</p> : null}
      {content.heading ? (
        <h2 className="text-display-m md:text-display-l text-balance">{content.heading}</h2>
      ) : null}
      {content.intro ? (
        <div className="text-lead text-muted-foreground [&_p:not(:last-child)]:mb-3">{content.intro}</div>
      ) : null}
    </header>
  );
}
