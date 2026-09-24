import { Suspense } from 'react';
import { AdminUsersCard, type AdminUserRow } from '@/components/admin/users-card';
import { PageHeader } from '@repo/ui/patterns/page-header';
import { TableRowsSkeleton } from '@repo/ui/patterns/skeletons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card';
import { requireSuperadmin } from '@/lib/auth/access';
import { listUsers } from '@/lib/db/queries/teams';
import { formatRelative } from '@repo/ui/lib/format';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Users" description="Accounts on this instance. Team membership is managed from each team's settings." />
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>All accounts</CardTitle>
          <CardDescription>Search by name or email address.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <Suspense fallback={<TableRowsSkeleton columns={[28, 32, 12, 12]} />}>
            <UsersData searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function UsersData({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireSuperadmin();
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? '';
  const users = await listUsers(q);

  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    banned: u.banned,
    banReason: u.banReason,
    teamCount: u.teamCount,
    createdAt: formatRelative(u.createdAt),
  }));
  return <AdminUsersCard users={rows} currentUserId={me.id} query={q} />;
}
