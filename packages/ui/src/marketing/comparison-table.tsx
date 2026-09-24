import type { ReactNode } from 'react';
import { Check, CircleDashed, Minus, TriangleAlert } from 'lucide-react';
import { cn } from '../lib/cn';
import { Section } from './section';
import { SectionHeader } from './section-header';
import {
  comparisonStateMeta,
  type ComparisonState,
  type SectionHeaderContent,
  type SectionSettings,
} from '../lib/marketing';

export interface ComparisonColumn {
  label: string;
  /** The column that is us. Tinted, and never the one that scrolls away. */
  highlight?: boolean;
}

export interface ComparisonCell {
  state: ComparisonState;
  note?: string | null;
}

export interface ComparisonRow {
  capability: string;
  cells: ComparisonCell[];
}

const ICON: Record<ComparisonState, typeof Check> = {
  yes: Check,
  partial: TriangleAlert,
  planned: CircleDashed,
  no: Minus,
};

const TONE_TEXT = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  info: 'text-info-text',
  neutral: 'text-muted-foreground',
} as const;

/**
 * Us against the alternatives. Factual, never disparaging: a "no" is a grey
 * dash rather than a red cross, and every partial answer carries the note that
 * says what the partial part is.
 */
export function ComparisonTable({
  header,
  columns,
  rows,
  footnote,
  settings,
}: {
  header?: SectionHeaderContent | null;
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  footnote?: ReactNode;
  settings?: SectionSettings | null;
}) {
  return (
    <Section settings={settings}>
      <SectionHeader content={header} className="mb-10" />
      <div className="panel overflow-x-auto scrollbar-slim">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption className="sr-only">
            {header?.heading ?? 'Feature comparison'}
          </caption>
          <thead>
            <tr className="border-b border-separator">
              <th scope="col" className="px-5 py-3 text-eyebrow text-muted-foreground">
                Capability
              </th>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={cn(
                    'px-5 py-3 text-label-s',
                    column.highlight ? 'bg-accent-subtle text-accent-text' : 'text-muted-foreground',
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.capability} className="border-b border-separator last:border-0">
                <th scope="row" className="px-5 py-3.5 text-body-s font-normal">
                  {row.capability}
                </th>
                {row.cells.map((cell, index) => {
                  const meta = comparisonStateMeta[cell.state];
                  const Icon = ICON[cell.state];
                  return (
                    <td
                      key={`${row.capability}-${index}`}
                      className={cn('px-5 py-3.5 align-top', columns[index]?.highlight && 'bg-accent-subtle/40')}
                    >
                      <span className={cn('flex items-start gap-2 text-body-s', TONE_TEXT[meta.tone])}>
                        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span className="sr-only">{meta.label}.</span>
                        {cell.note ? <span className="text-foreground">{cell.note}</span> : null}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnote ? (
        <div className="mt-4 text-body-xs text-muted-foreground [&_p:not(:last-child)]:mb-2">{footnote}</div>
      ) : null}
    </Section>
  );
}
