'use client';

import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/accordion';
import { Section } from './section';
import { SectionHeader } from './section-header';
import type { SectionHeaderContent, SectionSettings } from '../lib/marketing';

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

/**
 * The questions an engineer actually asks before trying something — including
 * the two the site answers with "no". The JSON-LD that goes with this lives in
 * the host, which is the only side that knows the page's URL.
 */
export function Faq({
  header,
  items,
  settings,
}: {
  header?: SectionHeaderContent | null;
  items: FaqItem[];
  settings?: SectionSettings | null;
}) {
  return (
    <Section settings={settings}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
        <SectionHeader content={header} />
        <Accordion className="border-t border-separator">
          {items.map((item, index) => (
            <AccordionItem key={item.question} value={`item-${index}`} className="border-b border-separator">
              <AccordionTrigger className="py-4 text-headline-m no-underline hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-body-m text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
