import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export default function TeamSettingsIndex({ params }: { params: Promise<{ team: string }> }) {
  return (
    <Suspense fallback={null}>
      <Redirect params={params} />
    </Suspense>
  );
}

async function Redirect({ params }: { params: Promise<{ team: string }> }) {
  const { team } = await params;
  redirect(`/teams/${team}/settings/members`);
  return null;
}
