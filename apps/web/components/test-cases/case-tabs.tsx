'use client';

import { NavTabs } from '@miguelfranken/ui/patterns/nav-tabs';
import { usePendingSelection } from '@/components/filters/url-filters';

/** Overview and History of one case. The clicked tab is marked before the next page arrives. */
export function CaseTabs({ page, active, version }: { page: string; active: 'overview' | 'history'; version: number }) {
  const { selected, onSelect } = usePendingSelection(active === 'overview' ? page : `${page}/history`);
  return (
    <NavTabs
      label="Test case sections"
      activeHref={selected}
      onSelect={onSelect}
      items={[
        { href: page, label: 'Overview' },
        { href: `${page}/history`, label: `History (${version})` },
      ]}
    />
  );
}
