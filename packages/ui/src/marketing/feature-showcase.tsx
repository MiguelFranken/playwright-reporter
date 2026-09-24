import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn';
import { InlineLink } from './action-link';
import { Section } from './section';
import { SectionHeader } from './section-header';
import type { MarketingLink, SectionHeaderContent, SectionSettings } from '../lib/marketing';

/**
 * Copy on one side, the product on the other. Four of these alternating down
 * the home page carry most of the argument, because each one shows the screen
 * it is describing rather than describing it.
 */
export function FeatureShowcase({
  header,
  bullets = [],
  visual,
  mediaSide = 'right',
  link,
  settings,
}: {
  header?: SectionHeaderContent | null;
  bullets?: string[];
  visual: ReactNode;
  mediaSide?: 'left' | 'right';
  link?: MarketingLink | null;
  settings?: SectionSettings | null;
}) {
  return (
    <Section settings={settings}>
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className={cn('flex flex-col gap-6', mediaSide === 'left' && 'lg:order-2')}>
          <SectionHeader content={header} />
          {bullets.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2.5 text-body-m">
                  <Check className="mt-1 size-4 shrink-0 text-success-text" aria-hidden />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {link ? <InlineLink link={link} /> : null}
        </div>
        <div className={cn('min-w-0', mediaSide === 'left' && 'lg:order-1')}>{visual}</div>
      </div>
    </Section>
  );
}
