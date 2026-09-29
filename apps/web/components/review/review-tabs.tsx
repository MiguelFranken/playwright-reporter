'use client';

import { usePathname } from 'next/navigation';
import { NavTabs } from '@miguelfranken/ui/patterns/nav-tabs';
import { usePendingSelection } from '@/components/filters/url-filters';

/**
 * The two views of a project's visual review: what waits for a reviewer, and
 * the approved screens. The project comes from the URL, so the page does not
 * have to read its params before its Suspense boundary.
 */
export function ReviewTabs() {
  const pathname = usePathname();
  const base = pathname.replace(/\/review(\/.*)?$/, '/review');
  const active = pathname.endsWith('/review/screens') ? `${base}/screens` : base;
  const { selected, onSelect } = usePendingSelection(active);
  return (
    <NavTabs
      label="Visual review"
      activeHref={selected}
      onSelect={onSelect}
      items={[
        { href: base, label: 'Review queue' },
        { href: `${base}/screens`, label: 'Screens' },
      ]}
    />
  );
}
