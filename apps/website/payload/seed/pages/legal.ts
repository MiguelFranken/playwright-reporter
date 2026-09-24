import { prose } from '../lexical';
import type { PageData, SeedContext } from '../types';

/**
 * Placeholders, marked as such.
 *
 * Imprint and privacy copy has to come from the operator (WEBSITE.md §10) —
 * seeding plausible-looking legal text would be worse than seeding an obvious
 * gap, because a plausible one gets shipped by accident.
 */
const PLACEHOLDER = 'PLACEHOLDER — replace before launch. This text is not legal copy.';

export function imprint(_ctx: SeedContext): PageData {
  return {
    title: 'Imprint',
    slug: 'legal/imprint',
    _status: 'published',
    hero: {
      variant: 'centered',
      heading: 'Imprint',
      eyebrow: 'Angaben gemäß § 5 DDG',
    },
    layout: [
      {
        blockType: 'content',
        columns: [
          {
            width: 'full',
            richText: prose([
              { p: PLACEHOLDER },
              { h2: 'Operator' },
              { p: 'Company name, legal form, street, postal code and city. Register court and registration number. VAT identification number under § 27 a UStG.' },
              { h2: 'Contact' },
              { p: 'Telephone number and email address.' },
              { h2: 'Responsible for the content under § 18 Abs. 2 MStV' },
              { p: 'Name and postal address.' },
              { h2: 'Dispute resolution' },
              { p: 'A statement on participation, or non-participation, in consumer arbitration proceedings under § 36 VSBG.' },
              { p: PLACEHOLDER },
            ]),
          },
        ],
      },
    ],
    meta: { title: 'Imprint', description: 'Imprint and legal information about the operator of this site.' },
  };
}

export function privacy(_ctx: SeedContext): PageData {
  return {
    title: 'Privacy',
    slug: 'legal/privacy',
    _status: 'published',
    hero: {
      variant: 'centered',
      heading: 'Privacy notice',
      eyebrow: 'Datenschutzerklärung',
    },
    layout: [
      {
        blockType: 'content',
        columns: [
          {
            width: 'full',
            richText: prose([
              { p: PLACEHOLDER },
              { h2: 'Controller' },
              { p: 'Name and contact details of the controller under Art. 4 (7) GDPR, and of the data protection officer where one is appointed.' },
              { h2: 'What this site collects' },
              { p: 'This site is a static marketing site. Describe the server log data the host records, its retention period, and the legal basis under Art. 6 (1)(f) GDPR.' },
              { h2: 'Cookies and local storage' },
              { p: 'The site stores a theme preference and, if the announcement bar is enabled, whether it has been dismissed. Both are kept in the browser and never sent to the server. State whether anything else is set.' },
              { h2: 'Hosting and processors' },
              { p: 'Name the hosting provider and any processors, with the relevant data processing agreement.' },
              { h2: 'Your rights' },
              { p: 'Access, rectification, erasure, restriction, data portability, objection, and the right to complain to a supervisory authority.' },
              { p: PLACEHOLDER },
            ]),
          },
        ],
      },
    ],
    meta: {
      title: 'Privacy',
      description: 'How this site handles personal data.',
    },
  };
}
