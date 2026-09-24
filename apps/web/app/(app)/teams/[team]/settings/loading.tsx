import { Skeleton } from '@repo/ui/components/skeleton';

/**
 * Shown while a settings section is being fetched — including when switching
 * between them, which is the case the pages' own Suspense boundaries cannot
 * cover: React holds the previous page on screen until the next one is ready,
 * so without this the strip would move and nothing below it would.
 *
 * The heading and the tab strip live in the layout and stay put.
 */
export default function TeamSettingsLoading() {
  return <Skeleton className="h-64 w-full rounded-xl" />;
}
