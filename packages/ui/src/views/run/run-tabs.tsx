'use client';

import { Bug, FileText, LayoutGrid, Settings, type LucideIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../../components/tabs';
import { RUN_TABS, RUN_TAB_LABELS as LABELS, type RunTab } from '../../lib/run-tab';

export type { RunTab };

/**
 * One glyph per tab, so the strip is scannable before it is read.
 *
 * The map lives here rather than beside the labels in `lib/run-tab` because
 * these are components: keeping them on the client side of the boundary leaves
 * that module plain data a server component can parse a URL with.
 */
const ICONS: Record<RunTab, LucideIcon> = {
  summary: LayoutGrid,
  specs: FileText,
  errors: Bug,
  config: Settings,
};

/**
 * Controlled tab strip for a run. The app binds `onValueChange` to the query
 * string; the content below is whatever the host renders as children.
 * `onTabIntent` reports a pointer or focus resting on a tab, so a host can
 * start loading it before the click.
 */
export function RunTabs({
  value,
  onValueChange,
  counts,
  isPending,
  onTabIntent,
  actions,
  children,
}: {
  value: RunTab;
  onValueChange: (next: RunTab) => void;
  onTabIntent?: (tab: RunTab) => void;
  /** Appended to a tab's label when known, e.g. "Errors (3)". */
  counts?: Partial<Record<RunTab, number>>;
  isPending?: boolean;
  /** Beside the tabs, at the end of the strip: a link to another page of the run. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const label = (tab: RunTab) => {
    const n = counts?.[tab];
    return n === undefined ? LABELS[tab] : `${LABELS[tab]} (${n})`;
  };
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(String(v) as RunTab)} className="gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <TabsList variant="line">
          {RUN_TABS.map((tab) => {
            const Icon = ICONS[tab];
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                onPointerEnter={onTabIntent && (() => onTabIntent(tab))}
                onFocus={onTabIntent && (() => onTabIntent(tab))}
              >
                <Icon aria-hidden />
                {label(tab)}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {actions ? <div className="flex items-center gap-2 pb-1">{actions}</div> : null}
      </div>
      <div className={isPending ? 'min-w-0 opacity-60 transition-opacity' : 'min-w-0 transition-opacity'}>{children}</div>
    </Tabs>
  );
}
