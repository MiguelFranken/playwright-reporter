import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { ActionLink } from './action-link';
import { Section } from './section';
import type { MarketingLink, SectionSettings } from '../lib/marketing';

/** The band that closes a page. */
export function CtaBand({
  heading,
  text,
  links = [],
  tone = 'default',
  settings,
}: {
  heading: string;
  text?: ReactNode;
  links?: MarketingLink[];
  tone?: 'default' | 'accent';
  settings?: SectionSettings | null;
}) {
  return (
    <Section settings={settings}>
      <div
        className={cn(
          'flex flex-col items-center gap-6 rounded-3xl border px-6 py-14 text-center md:px-16',
          tone === 'accent'
            ? 'border-accent-border bg-accent-subtle'
            : 'border-border bg-surface shadow-e2',
        )}
      >
        <h2 className="max-w-2xl text-display-m md:text-display-l text-balance">{heading}</h2>
        {text ? (
          <div className="max-w-xl text-lead text-muted-foreground [&_p:not(:last-child)]:mb-3">{text}</div>
        ) : null}
        {links.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-3">
            {links.map((link) => (
              <ActionLink key={`${link.href}-${link.label}`} link={link} />
            ))}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
