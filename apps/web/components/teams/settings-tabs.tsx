'use client';

import { usePathname } from 'next/navigation';
import { NavTabs, NavTabsSkeleton } from '@repo/ui/patterns/nav-tabs';
import { usePendingSelection } from '@/components/filters/url-filters';

const TABS = [
  { segment: 'members', label: 'Members' },
  { segment: 'projects', label: 'Projects' },
  { segment: 'general', label: 'General' },
];

/**
 * The team slug arrives as a prop from the layout, so only the active-tab
 * highlight depends on `usePathname` — and the component ships inside a
 * Suspense boundary for that reason.
 *
 * The strip marks the clicked section straight away rather than waiting for the
 * next page to render; `loading.tsx` beside these routes turns the body into a
 * placeholder over the same stretch, so the whole switch lands at once.
 */
export function SettingsTabs({ teamSlug }: { teamSlug: string }) {
  const pathname = usePathname();
  const { selected, onSelect } = usePendingSelection(pathname);
  const items = TABS.map((t) => ({ href: `/teams/${teamSlug}/settings/${t.segment}`, label: t.label }));
  return <NavTabs items={items} activeHref={selected} onSelect={onSelect} label="Team settings sections" />;
}

export { NavTabsSkeleton as SettingsTabsSkeleton };
