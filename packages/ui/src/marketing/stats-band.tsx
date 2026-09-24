import { Section } from './section';
import { SectionHeader } from './section-header';
import type { SectionHeaderContent, SectionSettings } from '../lib/marketing';

export interface StatItem {
  value: string;
  label: string;
  hint?: string | null;
}

/** Short claims in a row: "Your Postgres", "Your blob store", "MIT licensed". */
export function StatsBand({
  header,
  items,
  settings,
}: {
  header?: SectionHeaderContent | null;
  items: StatItem[];
  settings?: SectionSettings | null;
}) {
  return (
    <Section settings={settings ?? { background: 'sunken' }}>
      <SectionHeader content={header} className="mb-10" />
      <dl className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          // A `dl` may only contain `dt`/`dd` pairs, optionally inside a `div`
          // that holds nothing else — so the hint lives in the `dd`.
          <div key={item.label} className="flex flex-col gap-1">
            <dt className="text-eyebrow text-muted-foreground">{item.label}</dt>
            <dd className="flex flex-col gap-1">
              <span className="text-metric-s md:text-display-m">{item.value}</span>
              {item.hint ? <span className="text-body-xs text-muted-foreground">{item.hint}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
