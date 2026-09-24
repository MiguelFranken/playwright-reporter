import { Suspense } from 'react';
import { PageHeader } from '@repo/ui/patterns/page-header';
import { SettingsTabs, SettingsTabsSkeleton } from '@/components/teams/settings-tabs';

/**
 * The heading is static; `params` is unwrapped inside the tabs' boundary, and
 * the tabs read the path there too, so neither blocks the prerender.
 */
export default function TeamSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ team: string }>;
}) {
  return (
    <>
      <PageHeader title="Team settings" description="Who can see this team, what they may do, and which projects it owns." />
      <Suspense fallback={<SettingsTabsSkeleton />}>
        <Tabs params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function Tabs({ params }: { params: Promise<{ team: string }> }) {
  const { team } = await params;
  return <SettingsTabs teamSlug={team} />;
}
