import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { ActionLink } from './action-link';
import type { MarketingLink } from '../lib/marketing';

export interface HeroProps {
  variant?: 'centered' | 'split';
  eyebrow?: string | null;
  heading: string;
  lead?: ReactNode;
  links?: MarketingLink[];
  /** The screenshot or live demo beside the copy. `split` only. */
  visual?: ReactNode;
  /** A copyable snippet under the lead. `centered` only. */
  snippet?: ReactNode;
}

/**
 * The top of a page. `split` puts the product next to the claim, which is the
 * strongest thing the home page can do; `centered` is for the pages where the
 * claim stands alone.
 */
export function Hero({
  variant = 'centered',
  eyebrow,
  heading,
  lead,
  links = [],
  visual,
  snippet,
}: HeroProps) {
  const split = variant === 'split' && Boolean(visual);
  return (
    <section className="bg-background pt-12 pb-16 md:pt-20 md:pb-24">
      <div
        className={cn(
          'mx-auto grid w-full max-w-[72rem] gap-12 px-5 md:px-8',
          split ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center' : '',
        )}
      >
        <div className={cn('flex flex-col gap-6', split ? 'max-w-xl' : 'mx-auto max-w-3xl text-center items-center')}>
          {eyebrow ? (
            <p className="text-eyebrow text-accent-text">{eyebrow}</p>
          ) : null}
          <h1 className="text-display-l md:text-display-xl text-balance">{heading}</h1>
          {lead ? (
            <div className="text-lead text-muted-foreground [&_p:not(:last-child)]:mb-3">{lead}</div>
          ) : null}
          {links.length > 0 ? (
            <div className={cn('flex flex-wrap gap-3', split ? '' : 'justify-center')}>
              {links.map((link) => (
                <ActionLink key={`${link.href}-${link.label}`} link={link} />
              ))}
            </div>
          ) : null}
          {snippet ? <div className={cn('w-full', split ? '' : 'text-left')}>{snippet}</div> : null}
        </div>
        {split ? <div className="min-w-0">{visual}</div> : null}
      </div>
    </section>
  );
}
