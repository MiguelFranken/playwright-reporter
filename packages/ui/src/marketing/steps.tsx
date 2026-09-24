import type { ReactNode } from 'react';
import { InlineLink } from './action-link';
import { Section } from './section';
import { SectionHeader } from './section-header';
import type { MarketingLink, SectionHeaderContent, SectionSettings } from '../lib/marketing';

export interface StepItem {
  title: string;
  description?: ReactNode;
  /** A code snippet or a screenshot belonging to this step. */
  aside?: ReactNode;
}

/**
 * A numbered sequence. The rail is a real ordered list, so a screen reader
 * announces "1 of 5" rather than reading a decorative circle.
 */
export function Steps({
  header,
  steps,
  link,
  settings,
}: {
  header?: SectionHeaderContent | null;
  steps: StepItem[];
  link?: MarketingLink | null;
  settings?: SectionSettings | null;
}) {
  return (
    <Section settings={settings}>
      <SectionHeader content={header} className="mb-10" />
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.title} className="group/step grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 md:grid-cols-[2.5rem_minmax(0,1fr)] md:gap-x-6">
            <div className="flex flex-col items-center">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent-border bg-accent-subtle text-label-s tabular-nums text-accent-text md:size-10 md:text-label-m">
                {index + 1}
              </span>
              {/* The connector stops at the last step rather than trailing off. */}
              <span className="w-px flex-1 bg-separator group-last/step:hidden" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-col gap-3 pb-10 group-last/step:pb-0">
              <h3 className="text-headline-m md:text-title-m">{step.title}</h3>
              {step.description ? (
                <div className="text-body-m text-muted-foreground [&_p:not(:last-child)]:mb-3">
                  {step.description}
                </div>
              ) : null}
              {step.aside ? <div className="min-w-0">{step.aside}</div> : null}
            </div>
          </li>
        ))}
      </ol>
      {link ? <InlineLink link={link} className="mt-10" /> : null}
    </Section>
  );
}
