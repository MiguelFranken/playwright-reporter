import type { ComponentType } from 'react';
import { cn } from '../lib/cn';
import { InlineLink } from './action-link';
import { Section } from './section';
import { SectionHeader } from './section-header';
import type { MarketingLink, SectionHeaderContent, SectionSettings } from '../lib/marketing';

export interface FeatureGridItem {
  icon?: ComponentType<{ className?: string }> | null;
  title: string;
  description: string;
  link?: MarketingLink | null;
}

const COLUMNS: Record<2 | 3 | 4, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

/** The three-pillars band, and any other "here are the capabilities" list. */
export function FeatureGrid({
  header,
  items,
  columns = 3,
  settings,
}: {
  header?: SectionHeaderContent | null;
  items: FeatureGridItem[];
  columns?: 2 | 3 | 4;
  settings?: SectionSettings | null;
}) {
  return (
    <Section settings={settings}>
      <SectionHeader content={header} className="mb-10" />
      <div className={cn('grid gap-4', COLUMNS[columns])}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="surface-card flex flex-col gap-3 rounded-xl p-5">
              {Icon ? (
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent-text">
                  <Icon className="size-4.5" />
                </span>
              ) : null}
              <h3 className="text-headline-m">{item.title}</h3>
              <p className="text-body-s text-muted-foreground">{item.description}</p>
              {item.link ? <InlineLink link={item.link} className="mt-auto pt-1" /> : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
