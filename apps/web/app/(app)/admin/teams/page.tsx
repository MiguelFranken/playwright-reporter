import { Suspense } from 'react';
import { AdminTeamsCard, type AdminTeamRow } from '@/components/admin/teams-card';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { requireSuperadmin } from '@/lib/auth/access';
import { listAllTeams } from '@/lib/db/queries/teams';
import { formatRelative } from '@miguelfranken/ui/lib/format';

export default function AdminTeamsPage() {
  return (
    <>
      <PageHeader title="Teams" description="Teams own projects and memberships. Only superadmins create and delete them." />
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>All teams</CardTitle>
          <CardDescription>Every team on this instance.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <Suspense fallback={<TableRowsSkeleton columns={[30, 25, 15, 15]} />}>
            <TeamsData />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function TeamsData() {
  await requireSuperadmin();
  const teams = await listAllTeams();
  const rows: AdminTeamRow[] = teams.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    memberCount: t.memberCount,
    projectCount: t.projectCount,
    createdAt: formatRelative(t.createdAt),
  }));
  return <AdminTeamsCard teams={rows} />;
}
